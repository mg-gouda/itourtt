import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrafficJobsService } from '../traffic-jobs/traffic-jobs.service.js';
import { JobPricingService } from '../job-pricing/job-pricing.service.js';
import { JobCompletionService } from '../common/services/job-completion.service.js';
import { normalizeImportName, plateDigits } from '../common/utils/import-name.util.js';

// ─────────────────────────────────────────────────────────────────────────────
// B2B "Import from Excel" — the traffic team's daily sheet → B2B traffic jobs.
//
// Rules (agreed with the operator 2026-11-18; see docs/map/11-business-rules.md
// › B2B Excel import):
//  - One sheet row = one job. Columns: A serial (ignored) · B date · C Arabic
//    route · D car no · E car category · F customer · G order no · H carrier
//    (driver for own cars, supplier for supplier cars) · I carrier type (only
//    used to flag a disagreement) · J ignored · K notes.
//  - Car numbers 2000–2004 are supplier cars; anything else is an own car,
//    matched to a vehicle by the plate's digits. The car number wins over col I.
//  - The route supplies service type + origin + destination (route defaults on
//    job_service_types). Pax = 1 adult.
//  - Anything that does not resolve to exactly one system record skips the
//    ROW (never the file) and is reported. Nothing is created on the fly —
//    except remembered name aliases, which a user maps explicitly.
//  - Past service dates are allowed here (only here). Every imported job is
//    COMPLETED (owner's rule, 2026-11-18): the sheet is the record of trips that
//    ran. Completion goes through JobCompletionService, so driver/rep fees are
//    created exactly as for a portal completion. Re-uploads match existing jobs
//    on date + customer + order no, in sheet order; a match may change the route,
//    car source, car / car type and driver, and completes the job if it is still
//    open (CANCELLED / NO_SHOW are left alone). Jobs missing from the sheet are
//    left alone.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPLIER_CAR_NUMBERS = new Set(['2000', '2001', '2002', '2003', '2004']);

/** Sheet "Car Category" (normalised) → system VehicleType.name. */
const CAR_CATEGORY_TO_VEHICLE_TYPE: Record<string, string> = {
  limo: 'Sedan',
  sedan: 'Sedan',
  hiace15: 'Hi Ace',
  hiace: 'Hi Ace',
  hiace7: 'Minivan 7',
  coaster: 'Coaster',
  coster: 'Coaster',
  bus: 'Bus',
};

export type AliasKind = 'CUSTOMER' | 'SUPPLIER' | 'DRIVER';
export type RowStatus = 'NEW' | 'CHANGED' | 'UNCHANGED' | 'SKIPPED';

export interface SheetRow {
  rowNo: number; // Excel row number, as the user sees it
  date: string | null; // YYYY-MM-DD
  route: string;
  carNo: string;
  carCategory: string;
  customer: string;
  orderNo: string;
  carrierName: string;
  carrierType: string;
  notes: string;
}

interface Resolved {
  customerId: string;
  jobServiceTypeId: string;
  serviceType: string;
  originAirportId: string | null;
  originZoneId: string | null;
  destinationAirportId: string | null;
  destinationZoneId: string | null;
  source: 'OWN' | 'SUPPLIER';
  vehicleId: string | null;
  driverId: string | null;
  supplierId: string | null;
  supplierCarTypeId: string | null;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface RowResult {
  rowNo: number;
  date: string | null;
  route: string;
  carNo: string;
  customer: string;
  orderNo: string;
  carrierName: string;
  notes: string;
  status: RowStatus;
  reasons: string[]; // why it is skipped
  warnings: string[]; // imported, but worth a look
  unmatched: { kind: AliasKind; name: string }[]; // names a user can map
  jobId?: string;
  jobRef?: string;
  changes?: FieldChange[];
  display?: { route: string; car: string; carrier: string; source: 'OWN' | 'SUPPLIER' };
  resolved?: Resolved;
}

interface Ctx {
  routesByAr: Map<string, any[]>;
  routeById: Map<string, any>;
  customers: Map<string, Set<string>>;
  customerById: Map<string, string>;
  suppliers: Map<string, Set<string>>;
  supplierById: Map<string, any>;
  drivers: Map<string, Set<string>>;
  driverById: Map<string, string>;
  vehiclesByDigits: Map<string, any[]>;
  vehicleById: Map<string, any>;
  supplierCarTypeById: Map<string, any>;
  aliases: Map<string, string>; // `${kind}|${normalized}` → targetId
}

@Injectable()
export class B2bExcelImportService {
  private readonly logger = new Logger(B2bExcelImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trafficJobs: TrafficJobsService,
    private readonly jobPricing: JobPricingService,
    private readonly jobCompletion: JobCompletionService,
  ) {}

  // ── Parsing ────────────────────────────────────────────────────────────────

  /** Reads the first sheet whose header row looks like the traffic sheet. */
  parseWorkbook(buffer: Buffer): SheetRow[] {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Could not read the file. Upload the traffic sheet as .xlsx.');
    }
    for (const name of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
      const headerIdx = grid.findIndex((r) => {
        const cells = (r || []).map((c) => normalizeImportName(c));
        return cells.includes('date') && cells.some((c) => c.includes('route')) && cells.some((c) => c.includes('carno'));
      });
      if (headerIdx === -1) continue;
      const header = grid[headerIdx].map((c) => normalizeImportName(c));
      const col = (pred: (h: string) => boolean, fallback: number) => {
        const i = header.findIndex(pred);
        return i === -1 ? fallback : i;
      };
      const C = {
        date: col((h) => h === 'date', 1),
        route: col((h) => h.includes('route'), 2),
        carNo: col((h) => h === 'carno', 3),
        carCategory: col((h) => h.includes('category'), 4),
        customer: col((h) => h.includes('customer'), 5),
        orderNo: col((h) => h.includes('order'), 6),
        carrierName: col((h) => h === 'carriername', 7),
        carrierType: col((h) => h === 'carriertype', 8),
        notes: col((h) => h === 'notes', 10),
      };
      const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/ /g, ' ').trim());
      const rows: SheetRow[] = [];
      for (let i = headerIdx + 1; i < grid.length; i++) {
        const r = grid[i] || [];
        const route = str(r[C.route]);
        const customer = str(r[C.customer]);
        const dateVal = r[C.date];
        // Blank lines and the car-number legend under the table carry no date,
        // route or customer — they are not jobs.
        if (!route && !customer && (dateVal === null || dateVal === '')) continue;
        rows.push({
          rowNo: i + 1,
          date: this.toIsoDate(dateVal),
          route,
          carNo: str(r[C.carNo]),
          carCategory: str(r[C.carCategory]),
          customer,
          orderNo: str(r[C.orderNo]),
          carrierName: str(r[C.carrierName]),
          carrierType: str(r[C.carrierType]),
          notes: str(r[C.notes]),
        });
      }
      return rows;
    }
    throw new BadRequestException(
      'No traffic sheet found. The file needs a header row with Date, Trrafic Route and CarNo columns.',
    );
  }

  private toIsoDate(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      if (!d || !d.y) return null;
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day/month/year (Egypt)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  // ── Context (all lookups loaded once per request) ──────────────────────────

  private async loadContext(): Promise<Ctx> {
    const [routes, customers, suppliers, drivers, vehicles, aliases] = await Promise.all([
      this.prisma.jobServiceType.findMany({ where: { isActive: true } }),
      this.prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, legalName: true, tradeName: true } }),
      this.prisma.supplier.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          carTypes: { select: { id: true, vehicleType: { select: { name: true } } } },
        },
      }),
      this.prisma.driver.findMany({ where: { deletedAt: null }, select: { id: true, name: true, isActive: true } }),
      this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: { id: true, plateNumber: true, isActive: true, vehicleType: { select: { name: true } } },
      }),
      this.prisma.importNameAlias.findMany(),
    ]);

    const add = (m: Map<string, Set<string>>, key: string, id: string) => {
      if (!key) return;
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(id);
    };

    const ctx: Ctx = {
      routesByAr: new Map(),
      routeById: new Map(),
      customers: new Map(),
      customerById: new Map(),
      suppliers: new Map(),
      supplierById: new Map(),
      drivers: new Map(),
      driverById: new Map(),
      vehiclesByDigits: new Map(),
      vehicleById: new Map(),
      supplierCarTypeById: new Map(),
      aliases: new Map(aliases.map((a) => [`${a.kind}|${a.normalizedName}`, a.targetId])),
    };

    for (const r of routes) {
      ctx.routeById.set(r.id, r);
      // Names are "EN | AR"; the sheet carries the Arabic half only. A route
      // without the separator is matched on its whole name.
      const parts = r.name.split(' | ');
      const keys = new Set([normalizeImportName(r.name), normalizeImportName(parts.slice(1).join(' | '))]);
      for (const k of keys) {
        if (!k) continue;
        if (!ctx.routesByAr.has(k)) ctx.routesByAr.set(k, []);
        ctx.routesByAr.get(k)!.push(r);
      }
    }
    for (const c of customers) {
      ctx.customerById.set(c.id, c.tradeName || c.legalName);
      add(ctx.customers, normalizeImportName(c.legalName), c.id);
      add(ctx.customers, normalizeImportName(c.tradeName), c.id);
    }
    for (const s of suppliers) {
      ctx.supplierById.set(s.id, s);
      add(ctx.suppliers, normalizeImportName(s.legalName), s.id);
      add(ctx.suppliers, normalizeImportName(s.tradeName), s.id);
      for (const ct of s.carTypes) ctx.supplierCarTypeById.set(ct.id, { ...ct, supplierName: s.tradeName || s.legalName });
    }
    // Inactive drivers only match when no active driver has the name.
    const activeDrivers = new Map<string, Set<string>>();
    for (const d of drivers) {
      ctx.driverById.set(d.id, d.name);
      add(d.isActive ? activeDrivers : ctx.drivers, normalizeImportName(d.name), d.id);
    }
    for (const [k, v] of activeDrivers) ctx.drivers.set(k, v);
    for (const v of vehicles) {
      ctx.vehicleById.set(v.id, v);
      const digits = plateDigits(v.plateNumber);
      if (!digits) continue;
      if (!ctx.vehiclesByDigits.has(digits)) ctx.vehiclesByDigits.set(digits, []);
      ctx.vehiclesByDigits.get(digits)!.push(v);
    }
    return ctx;
  }

  private lookup(ctx: Ctx, kind: AliasKind, index: Map<string, Set<string>>, name: string): { id?: string; ambiguous?: number } {
    const key = normalizeImportName(name);
    if (!key) return {};
    const alias = ctx.aliases.get(`${kind}|${key}`);
    if (alias) return { id: alias };
    const ids = index.get(key);
    if (!ids || ids.size === 0) return {};
    if (ids.size > 1) return { ambiguous: ids.size };
    return { id: [...ids][0] };
  }

  // ── Resolution of one row ──────────────────────────────────────────────────

  private resolveRow(ctx: Ctx, row: SheetRow): RowResult {
    const res: RowResult = {
      rowNo: row.rowNo,
      date: row.date,
      route: row.route,
      carNo: row.carNo,
      customer: row.customer,
      orderNo: row.orderNo,
      carrierName: row.carrierName,
      notes: row.notes,
      status: 'NEW',
      reasons: [],
      warnings: [],
      unmatched: [],
    };
    const skip = (msg: string) => res.reasons.push(msg);

    if (!row.date) skip('Date is missing or not a date');

    // Customer
    let customerId: string | undefined;
    if (!row.customer) skip('Customer name is empty');
    else {
      const c = this.lookup(ctx, 'CUSTOMER', ctx.customers, row.customer);
      if (c.ambiguous) skip(`Customer "${row.customer}" matches ${c.ambiguous} customers`);
      else if (!c.id || !ctx.customerById.has(c.id)) {
        skip(`Customer "${row.customer}" not found`);
        res.unmatched.push({ kind: 'CUSTOMER', name: row.customer });
      } else customerId = c.id;
    }

    // Route + its defaults
    let route: any;
    if (!row.route) skip('Route is empty');
    else {
      const matches = ctx.routesByAr.get(normalizeImportName(row.route)) || [];
      if (matches.length === 0) skip(`Route "${row.route}" not found in Route/Service Types`);
      else if (matches.length > 1) skip(`Route "${row.route}" matches ${matches.length} routes (${matches.map((m) => m.name).join(' / ')})`);
      else {
        route = matches[0];
        const hasOrigin = [route.fromAirportId, route.fromZoneId].filter(Boolean).length === 1;
        const hasDest = [route.toAirportId, route.toZoneId].filter(Boolean).length === 1;
        if (!route.defaultServiceType || !hasOrigin || !hasDest) {
          skip(`Route "${route.name}" has no default service type / origin / destination yet`);
          route = undefined;
        }
      }
    }

    // Car source — the car number decides; column I only raises a flag.
    const carNo = plateDigits(row.carNo);
    const source: 'OWN' | 'SUPPLIER' = SUPPLIER_CAR_NUMBERS.has(carNo) ? 'SUPPLIER' : 'OWN';
    const colI = normalizeImportName(row.carrierType);
    if (colI && ((colI === 'supplier') !== (source === 'SUPPLIER'))) {
      res.warnings.push(`Carrier Type says "${row.carrierType}" but car ${row.carNo} is ${source === 'SUPPLIER' ? 'a supplier car' : 'an own car'} — car number used`);
    }

    let vehicleId: string | null = null;
    let driverId: string | null = null;
    let supplierId: string | null = null;
    let supplierCarTypeId: string | null = null;
    let carLabel = row.carNo;
    let carrierLabel = row.carrierName;

    if (!carNo) skip('Car number is empty');
    else if (source === 'OWN') {
      const all = ctx.vehiclesByDigits.get(carNo) || [];
      const active = all.filter((v) => v.isActive);
      const pool = active.length > 0 ? active : all;
      if (pool.length === 0) skip(`Car ${row.carNo} not found in vehicles`);
      else if (pool.length > 1) skip(`Car ${row.carNo} matches ${pool.length} vehicles (${pool.map((v) => v.plateNumber).join(' / ')})`);
      else {
        vehicleId = pool[0].id;
        carLabel = pool[0].plateNumber;
      }
      if (!row.carrierName) skip('Driver (Carrier Name) is empty');
      else {
        const d = this.lookup(ctx, 'DRIVER', ctx.drivers, row.carrierName);
        if (d.ambiguous) skip(`Driver "${row.carrierName}" matches ${d.ambiguous} drivers`);
        else if (!d.id || !ctx.driverById.has(d.id)) {
          skip(`Driver "${row.carrierName}" not found`);
          res.unmatched.push({ kind: 'DRIVER', name: row.carrierName });
        } else {
          driverId = d.id;
          carrierLabel = ctx.driverById.get(d.id)!;
        }
      }
    } else {
      if (!row.carrierName) skip('Supplier (Carrier Name) is empty');
      else {
        const s = this.lookup(ctx, 'SUPPLIER', ctx.suppliers, row.carrierName);
        if (s.ambiguous) skip(`Supplier "${row.carrierName}" matches ${s.ambiguous} suppliers`);
        else if (!s.id || !ctx.supplierById.has(s.id)) {
          skip(`Supplier "${row.carrierName}" not found`);
          res.unmatched.push({ kind: 'SUPPLIER', name: row.carrierName });
        } else {
          const sup = ctx.supplierById.get(s.id);
          supplierId = sup.id;
          carrierLabel = sup.tradeName || sup.legalName;
          const typeName = CAR_CATEGORY_TO_VEHICLE_TYPE[normalizeImportName(row.carCategory)];
          if (!row.carCategory) skip('Car Category is empty (needed for supplier cars)');
          else if (!typeName) skip(`Car Category "${row.carCategory}" has no matching vehicle type`);
          else {
            const ct = sup.carTypes.find((t: any) => t.vehicleType.name === typeName);
            if (!ct) skip(`Supplier "${carrierLabel}" has no ${typeName} car type`);
            else {
              supplierCarTypeId = ct.id;
              carLabel = `${typeName} (supplier)`;
            }
          }
        }
      }
    }

    if (res.reasons.length > 0 || !customerId || !route) {
      res.status = 'SKIPPED';
      return res;
    }

    res.resolved = {
      customerId,
      jobServiceTypeId: route.id,
      serviceType: route.defaultServiceType,
      originAirportId: route.fromAirportId ?? null,
      originZoneId: route.fromAirportId ? null : route.fromZoneId ?? null,
      destinationAirportId: route.toAirportId ?? null,
      destinationZoneId: route.toAirportId ? null : route.toZoneId ?? null,
      source,
      vehicleId,
      driverId,
      supplierId,
      supplierCarTypeId,
    };
    res.display = { route: route.name, car: carLabel, carrier: carrierLabel, source };
    return res;
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  /** Dates in the file with their row counts (the day picker). */
  summarizeDates(rows: SheetRow[]) {
    const counts = new Map<string, number>();
    let undated = 0;
    for (const r of rows) {
      if (r.date) counts.set(r.date, (counts.get(r.date) || 0) + 1);
      else undated++;
    }
    return {
      dates: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      undated,
    };
  }

  async preview(buffer: Buffer, dates: string[]): Promise<{ dates: { date: string; count: number }[]; undated: number; rows: RowResult[] }> {
    const all = this.parseWorkbook(buffer);
    const summary = this.summarizeDates(all);
    if (dates.length === 0) return { ...summary, rows: [] };
    const wanted = new Set(dates);
    const rows = all.filter((r) => r.date && wanted.has(r.date));
    return { ...summary, rows: await this.evaluate(rows) };
  }

  private async evaluate(rows: SheetRow[]): Promise<RowResult[]> {
    const ctx = await this.loadContext();
    const results = rows.map((r) => this.resolveRow(ctx, r));

    // Existing B2B jobs for the same days + customers, oldest first.
    const dates = [...new Set(results.map((r) => r.date).filter(Boolean))] as string[];
    const customerIds = [...new Set(results.map((r) => r.resolved?.customerId).filter(Boolean))] as string[];
    // Customers of skipped rows still claim their slot, so resolve those too.
    for (const r of results) {
      if (r.resolved) continue;
      const c = this.lookup(ctx, 'CUSTOMER', ctx.customers, r.customer);
      if (c.id) customerIds.push(c.id);
    }
    const existing = dates.length === 0 ? [] : await this.prisma.trafficJob.findMany({
      where: {
        bookingChannel: 'B2B',
        deletedAt: null,
        jobDate: { in: dates.map((d) => new Date(d)) },
        customerId: { in: [...new Set(customerIds)] },
        customerJobId: { not: null },
      },
      orderBy: [{ createdAt: 'asc' }, { internalRef: 'asc' }],
      select: {
        id: true,
        internalRef: true,
        jobDate: true,
        customerId: true,
        customerJobId: true,
        jobServiceTypeId: true,
        status: true,
        assignment: { select: { vehicleId: true, driverId: true, supplierId: true, supplierCarTypeId: true } },
      },
    });
    const queues = new Map<string, typeof existing>();
    for (const j of existing) {
      const key = `${j.jobDate.toISOString().slice(0, 10)}|${j.customerId}|${normalizeImportName(j.customerJobId)}`;
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key)!.push(j);
    }

    for (const r of results) {
      const order = normalizeImportName(r.orderNo);
      if (!order || !r.date) continue; // blank order no → always a new job
      const customerId = r.resolved?.customerId ?? this.lookup(ctx, 'CUSTOMER', ctx.customers, r.customer).id;
      if (!customerId) continue;
      const job = queues.get(`${r.date}|${customerId}|${order}`)?.shift();
      if (!job) continue;
      r.jobId = job.id;
      r.jobRef = job.internalRef;
      if (r.status === 'SKIPPED') {
        r.warnings.push(`Matches existing job ${job.internalRef}, which is left unchanged`);
        continue;
      }
      r.changes = this.diff(ctx, job, r.resolved!);
      r.status = r.changes.length > 0 ? 'CHANGED' : 'UNCHANGED';
    }
    return results;
  }

  private diff(ctx: Ctx, job: any, to: Resolved): FieldChange[] {
    const out: FieldChange[] = [];
    const a = job.assignment || {};
    const routeName = (id: string | null) => (id ? ctx.routeById.get(id)?.name ?? '(inactive route)' : '—');
    const carName = (vid: string | null, ctid: string | null) =>
      vid ? ctx.vehicleById.get(vid)?.plateNumber ?? '(unknown car)'
        : ctid ? `${ctx.supplierCarTypeById.get(ctid)?.vehicleType?.name ?? '?'} (supplier)` : '—';
    const carrier = (did: string | null, sid: string | null) =>
      did ? ctx.driverById.get(did) ?? '(unknown driver)'
        : sid ? (ctx.supplierById.get(sid)?.tradeName || ctx.supplierById.get(sid)?.legalName || '(unknown supplier)') : '—';
    const fromSource = a.supplierId && !a.vehicleId ? 'SUPPLIER' : a.vehicleId ? 'OWN' : '—';

    if (job.jobServiceTypeId !== to.jobServiceTypeId) out.push({ field: 'Route', from: routeName(job.jobServiceTypeId), to: routeName(to.jobServiceTypeId) });
    if (fromSource !== to.source) out.push({ field: 'Car source', from: fromSource, to: to.source });
    if ((a.vehicleId ?? null) !== to.vehicleId || (a.supplierCarTypeId ?? null) !== to.supplierCarTypeId) {
      out.push({ field: 'Car', from: carName(a.vehicleId ?? null, a.supplierCarTypeId ?? null), to: carName(to.vehicleId, to.supplierCarTypeId) });
    }
    if ((a.driverId ?? null) !== to.driverId || (a.supplierId ?? null) !== to.supplierId) {
      out.push({ field: to.source === 'OWN' ? 'Driver' : 'Supplier', from: carrier(a.driverId ?? null, a.supplierId ?? null), to: carrier(to.driverId, to.supplierId) });
    }
    if (!['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(job.status)) {
      out.push({ field: 'Status', from: job.status, to: 'COMPLETED' });
    }
    return out;
  }

  // ── Commit ─────────────────────────────────────────────────────────────────

  async commit(
    buffer: Buffer,
    fileName: string,
    dates: string[],
    updateRowNos: number[],
    user: { id: string; email?: string; ip?: string | null },
  ) {
    if (dates.length === 0) throw new BadRequestException('Pick at least one date to import');
    const { rows } = await this.preview(buffer, dates);
    const toUpdate = new Set(updateRowNos);
    const created: { rowNo: number; jobRef: string }[] = [];
    const updated: { rowNo: number; jobRef: string }[] = [];
    const failed: { rowNo: number; reason: string }[] = [];
    const logs: any[] = [];
    const userName = user.email || (await this.prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }))?.email || 'unknown';

    for (const r of rows) {
      try {
        if (r.status === 'NEW') {
          const job = await this.createJob(r, user.id);
          await this.jobPricing.syncJob(job.id);
          created.push({ rowNo: r.rowNo, jobRef: job.internalRef });
          logs.push({
            userId: user.id, userName, action: 'CREATE', entity: 'TrafficJob', entityId: job.id,
            jobId: job.id, jobRef: job.internalRef, ipAddress: user.ip ?? null,
            summary: `Imported B2B job ${job.internalRef} from "${fileName}" (row ${r.rowNo})`,
            details: { source: 'B2B Excel import', fileName, row: this.rowSnapshot(r) },
          });
        } else if (r.status === 'CHANGED' && toUpdate.has(r.rowNo)) {
          const before = await this.updateJob(r, user.id);
          await this.jobPricing.syncJob(r.jobId!);
          updated.push({ rowNo: r.rowNo, jobRef: r.jobRef! });
          logs.push({
            userId: user.id, userName, action: 'UPDATE', entity: 'TrafficJob', entityId: r.jobId,
            jobId: r.jobId, jobRef: r.jobRef, ipAddress: user.ip ?? null,
            summary: `Updated B2B job ${r.jobRef} from "${fileName}" (row ${r.rowNo}): ${r.changes!.map((c) => c.field).join(', ')}`,
            details: { source: 'B2B Excel import', fileName, changes: r.changes, row: this.rowSnapshot(r) },
            previousData: before,
          });
        }
      } catch (e: any) {
        this.logger.warn(`B2B import row ${r.rowNo} failed: ${e?.message}`);
        failed.push({ rowNo: r.rowNo, reason: e?.message || 'Unknown error' });
      }
    }

    const skipped = rows.filter((r) => r.status === 'SKIPPED').map((r) => ({ rowNo: r.rowNo, reasons: r.reasons }));
    const notUpdated = rows.filter((r) => r.status === 'CHANGED' && !toUpdate.has(r.rowNo)).map((r) => ({ rowNo: r.rowNo, jobRef: r.jobRef }));
    const counts = {
      rows: rows.length,
      created: created.length,
      updated: updated.length,
      unchanged: rows.filter((r) => r.status === 'UNCHANGED').length,
      changedNotUpdated: notUpdated.length,
      skipped: skipped.length,
      failed: failed.length,
    };
    logs.unshift({
      userId: user.id, userName, action: 'CREATE', entity: 'B2BExcelImport', entityId: null, ipAddress: user.ip ?? null,
      summary: `B2B Excel import "${fileName}" (${dates.join(', ')}): ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.skipped + counts.failed} skipped`,
      details: { fileName, dates, counts, created, updated, notUpdated, skipped, failed },
    });
    await this.prisma.activityLog.createMany({ data: logs });

    return { counts, created, updated, notUpdated, skipped: rows.filter((r) => r.status === 'SKIPPED'), failed };
  }

  private rowSnapshot(r: RowResult) {
    return { rowNo: r.rowNo, date: r.date, route: r.route, carNo: r.carNo, customer: r.customer, orderNo: r.orderNo, carrierName: r.carrierName };
  }

  private async createJob(r: RowResult, userId: string) {
    const x = r.resolved!;
    const internalRef = await this.trafficJobs.generateInternalRef();
    const notes = r.notes;
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.trafficJob.create({
        data: {
          internalRef,
          bookingChannel: 'B2B',
          customerId: x.customerId,
          customerJobId: r.orderNo || null,
          serviceType: x.serviceType as any,
          jobServiceTypeId: x.jobServiceTypeId,
          jobDate: new Date(r.date!),
          adultCount: 1,
          childCount: 0,
          paxCount: 1,
          originAirportId: x.originAirportId,
          originZoneId: x.originZoneId,
          destinationAirportId: x.destinationAirportId,
          destinationZoneId: x.destinationZoneId,
          fromZoneId: x.originZoneId,
          toZoneId: x.destinationZoneId,
          notes: notes || null,
          status: 'ASSIGNED',
          createdById: userId,
        },
        select: { id: true, internalRef: true },
      });
      await tx.trafficAssignment.create({
        data: {
          trafficJobId: job.id,
          vehicleId: x.vehicleId,
          driverId: x.driverId,
          supplierId: x.supplierId,
          supplierCarTypeId: x.supplierCarTypeId,
          assignedById: userId,
        },
      });
      await this.completeJob(tx, job.id);
      return job;
    });
  }

  /** Applies route + assignment changes; job status is never touched. Returns the before-snapshot. */
  private async updateJob(r: RowResult, userId: string) {
    const x = r.resolved!;
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.trafficJob.findUniqueOrThrow({
        where: { id: r.jobId! },
        select: {
          jobServiceTypeId: true, serviceType: true,
          originAirportId: true, originZoneId: true, originHotelId: true,
          destinationAirportId: true, destinationZoneId: true, destinationHotelId: true,
          assignment: { select: { id: true, vehicleId: true, driverId: true, supplierId: true, supplierCarTypeId: true } },
        },
      });
      if (job.jobServiceTypeId !== x.jobServiceTypeId) {
        await tx.trafficJob.update({
          where: { id: r.jobId! },
          data: {
            jobServiceTypeId: x.jobServiceTypeId,
            serviceType: x.serviceType as any,
            originAirportId: x.originAirportId,
            originZoneId: x.originZoneId,
            originHotelId: null,
            destinationAirportId: x.destinationAirportId,
            destinationZoneId: x.destinationZoneId,
            destinationHotelId: null,
            fromZoneId: x.originZoneId,
            toZoneId: x.destinationZoneId,
          },
        });
      }
      const assignment = {
        vehicleId: x.vehicleId,
        driverId: x.driverId,
        supplierId: x.supplierId,
        supplierCarTypeId: x.supplierCarTypeId,
      };
      if (job.assignment) {
        await tx.trafficAssignment.update({ where: { id: job.assignment.id }, data: assignment });
      } else {
        await tx.trafficAssignment.create({ data: { trafficJobId: r.jobId!, assignedById: userId, ...assignment } });
      }
      await this.completeJob(tx, r.jobId!);
      return job;
    });
  }

  /**
   * Imported jobs are completed (the sheet records trips that ran). Every assigned leg is closed
   * and the job goes through JobCompletionService.reconcileJobStatus, which sets COMPLETED and
   * creates the driver trip fee / rep fee like a portal completion. A supplier-only job has no
   * own driver or rep leg, so the roll-up cannot close it — its status is set directly.
   * CANCELLED / NO_SHOW jobs are never touched.
   */
  private async completeJob(tx: any, jobId: string) {
    const job = await tx.trafficJob.findUnique({
      where: { id: jobId },
      select: { status: true, assignment: { select: { id: true, driverId: true, repId: true, supplierId: true } } },
    });
    if (!job || ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(job.status)) return;
    const a = job.assignment;
    if (a) {
      await tx.trafficAssignment.update({
        where: { id: a.id },
        data: {
          ...(a.driverId && { driverStatus: 'COMPLETED' }),
          ...(a.repId && { repStatus: 'COMPLETED' }),
          ...(a.supplierId && { supplierStatus: 'COMPLETED' }),
        },
      });
    }
    const r = await this.jobCompletion.reconcileJobStatus(tx, jobId);
    if (!r.completed) {
      await tx.trafficJob.update({ where: { id: jobId }, data: { status: 'COMPLETED' } });
    }
  }

  // ── Aliases + pickers ──────────────────────────────────────────────────────

  async saveAlias(kind: AliasKind, rawName: string, targetId: string, userId: string) {
    const normalizedName = normalizeImportName(rawName);
    if (!normalizedName) throw new BadRequestException('Name is empty');
    const exists =
      kind === 'CUSTOMER' ? await this.prisma.customer.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } })
      : kind === 'SUPPLIER' ? await this.prisma.supplier.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } })
      : await this.prisma.driver.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
    if (!exists) throw new BadRequestException('The selected record no longer exists');
    return this.prisma.importNameAlias.upsert({
      where: { kind_normalizedName: { kind, normalizedName } },
      create: { kind, normalizedName, rawName: rawName.trim(), targetId, createdById: userId },
      update: { targetId, rawName: rawName.trim(), createdById: userId },
    });
  }

  /** Names + ids for the "map to…" pickers (no other fields leave the server). */
  async lookups() {
    const [customers, suppliers, drivers] = await Promise.all([
      this.prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: 'asc' } }),
      this.prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: 'asc' } }),
      this.prisma.driver.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const label = (l: string, t: string | null) => (t && t !== l ? `${t} (${l})` : l);
    return {
      CUSTOMER: customers.map((c) => ({ id: c.id, name: label(c.legalName, c.tradeName) })),
      SUPPLIER: suppliers.map((s) => ({ id: s.id, name: label(s.legalName, s.tradeName) })),
      DRIVER: drivers.map((d) => ({ id: d.id, name: d.name })),
    };
  }
}
