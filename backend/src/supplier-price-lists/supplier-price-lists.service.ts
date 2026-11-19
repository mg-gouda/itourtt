import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PRICE_COLUMNS, findSheet, loadRouteIndex, parsePrice, priceColumnsIn, routeCode, sheetBuffer,
} from '../common/utils/route-price-sheet.util.js';
import { SupplierCostingService, type RecalcReport } from './supplier-costing.service.js';

export interface PriceCell {
  jobServiceTypeId: string;
  vehicleTypeId: string;
  price: number | null; // null clears
}

/** Users alerted about ended lists: admins and roles holding this key (finance roles). */
export const PRICE_LIST_ALERT_PERMISSION = 'supplier-price-lists.alerts';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const day = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) throw new BadRequestException(`Invalid date "${iso}" (YYYY-MM-DD)`);
  return new Date(`${iso}T00:00:00Z`);
};
const todayCairo = () => day(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * Supplier price lists (rules: docs/map/11-business-rules.md › Supplier price lists).
 *
 * - A list is one season / price level ("List A Winter 2026") with a validity range; an empty end
 *   date means "until changed". A list whose end date has passed is **read-only** (kept for review):
 *   its prices can't change, but its dates can (to extend it).
 * - Which list a supplier is on is a dated history (SupplierPriceListAssignment). Moving suppliers
 *   to another list from a date — backdated too — re-costs their jobs from that date.
 *   Supplier.priceListId mirrors the list in force today, for display only.
 * - After a list ends, suppliers still on it keep its prices (it may have been agreed to continue);
 *   admins and finance roles are alerted daily to extend it or move the suppliers.
 */
@Injectable()
export class SupplierPriceListsService {
  private readonly logger = new Logger(SupplierPriceListsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: SupplierCostingService,
  ) {}

  private status(l: { validFrom: Date; validTo: Date | null }, today = todayCairo()) {
    if (l.validTo && l.validTo < today) return 'ENDED' as const;
    if (l.validFrom > today) return 'UPCOMING' as const;
    return 'CURRENT' as const;
  }

  async findAll() {
    const today = todayCairo();
    const lists = await this.prisma.supplierPriceList.findMany({
      orderBy: [{ validFrom: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { items: true } },
        assignments: {
          where: { validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }], supplier: { deletedAt: null } },
          select: { supplier: { select: { id: true, legalName: true, tradeName: true } } },
        },
      },
    });
    return lists.map(({ _count, assignments, ...l }) => ({
      ...l,
      validFrom: isoDay(l.validFrom),
      validTo: l.validTo ? isoDay(l.validTo) : null,
      status: this.status(l, today),
      readOnly: this.status(l, today) === 'ENDED',
      itemCount: _count.items,
      suppliers: assignments.map((a) => a.supplier).sort((a, b) => a.legalName.localeCompare(b.legalName)),
    }));
  }

  async create(dto: { name: string; validFrom?: string; validTo?: string | null; isDefaultForNew?: boolean; isOwnCarList?: boolean; notes?: string }) {
    const name = dto.name.trim();
    if (await this.prisma.supplierPriceList.findUnique({ where: { name } })) {
      throw new ConflictException(`Price list "${name}" already exists`);
    }
    const validFrom = dto.validFrom ? day(dto.validFrom) : todayCairo();
    const validTo = dto.validTo ? day(dto.validTo) : null;
    if (validTo && validTo < validFrom) throw new BadRequestException('End date is before the start date');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefaultForNew) await tx.supplierPriceList.updateMany({ where: { isDefaultForNew: true }, data: { isDefaultForNew: false } });
      return tx.supplierPriceList.create({
        data: { name, validFrom, validTo, isDefaultForNew: !!dto.isDefaultForNew, isOwnCarList: !!dto.isOwnCarList, notes: dto.notes ?? null },
      });
    });
  }

  async update(id: string, dto: { name?: string; validFrom?: string; validTo?: string | null; isDefaultForNew?: boolean; isOwnCarList?: boolean; notes?: string | null }) {
    const list = await this.get(id);
    const validFrom = dto.validFrom !== undefined ? day(dto.validFrom) : list.validFrom;
    const validTo = dto.validTo !== undefined ? (dto.validTo ? day(dto.validTo) : null) : list.validTo;
    if (validTo && validTo < validFrom) throw new BadRequestException('End date is before the start date');
    // An ended list is read-only except for its dates (extending it) and notes.
    if (this.status(list) === 'ENDED' && (dto.name !== undefined || dto.isDefaultForNew || dto.isOwnCarList !== undefined)) {
      if (!(validTo === null || validTo >= todayCairo())) this.readOnlyError(list);
    }
    return this.prisma.$transaction(async (tx) => {
      // Only one list is the default for new suppliers. Own-car lists may be several — one per season.
      if (dto.isDefaultForNew) await tx.supplierPriceList.updateMany({ where: { id: { not: id }, isDefaultForNew: true }, data: { isDefaultForNew: false } });
      return tx.supplierPriceList.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          validFrom,
          validTo,
          ...(dto.isDefaultForNew !== undefined && { isDefaultForNew: dto.isDefaultForNew }),
          ...(dto.isOwnCarList !== undefined && { isOwnCarList: dto.isOwnCarList }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });
    });
  }

  /** A list that any supplier has ever been on is history: it can't be deleted. */
  async remove(id: string) {
    const list = await this.prisma.supplierPriceList.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (!list) throw new NotFoundException('Price list not found');
    if (list._count.assignments > 0) {
      throw new BadRequestException(`"${list.name}" has supplier history (${list._count.assignments} assignment(s)) — it is kept for review and can't be deleted`);
    }
    await this.prisma.supplierPriceList.delete({ where: { id } });
    return { deleted: true };
  }

  private async get(id: string) {
    const list = await this.prisma.supplierPriceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
  }

  private readOnlyError(list: { name: string; validTo: Date | null }): never {
    throw new BadRequestException(
      `"${list.name}" ended on ${list.validTo ? isoDay(list.validTo) : '—'} and is kept read-only for review. Extend its end date to change it.`,
    );
  }

  private async columns() {
    const types = await this.prisma.vehicleType.findMany({ select: { id: true, name: true } });
    return PRICE_COLUMNS.map((c) => ({ ...c, vehicleTypeId: types.find((t) => t.name === c.vehicleType)?.id ?? null }));
  }

  /** Route rows × car-type columns for one list. */
  async grid(id: string) {
    const list = await this.get(id);
    const [routes, cols, items] = await Promise.all([
      this.prisma.jobServiceType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.columns(),
      this.prisma.supplierPriceListItem.findMany({ where: { priceListId: id }, select: { jobServiceTypeId: true, vehicleTypeId: true, price: true } }),
    ]);
    return {
      list: { ...list, validFrom: isoDay(list.validFrom), validTo: list.validTo ? isoDay(list.validTo) : null, readOnly: this.status(list) === 'ENDED' },
      columns: cols.filter((c) => c.vehicleTypeId),
      routes,
      prices: items.map((i) => ({ jobServiceTypeId: i.jobServiceTypeId, vehicleTypeId: i.vehicleTypeId, price: Number(i.price) })),
    };
  }

  private async writeCells(id: string, cells: PriceCell[]) {
    let saved = 0;
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of cells) {
        if (c.price === null || !(c.price > 0)) {
          cleared += (await tx.supplierPriceListItem.deleteMany({ where: { priceListId: id, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId } })).count;
          continue;
        }
        await tx.supplierPriceListItem.upsert({
          where: { priceListId_jobServiceTypeId_vehicleTypeId: { priceListId: id, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId } },
          create: { priceListId: id, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId, price: c.price },
          update: { price: c.price },
        });
        saved++;
      }
    });
    return { saved, cleared };
  }

  /**
   * Saves edited grid cells (null/0 removes) and re-costs the jobs priced from them — every job, from
   * the list's start, whose supplier was on this list on its date (backdated changes included).
   */
  async saveCells(id: string, cells: PriceCell[]): Promise<{ saved: number; cleared: number; recalc: RecalcReport }> {
    const list = await this.get(id);
    if (this.status(list) === 'ENDED') this.readOnlyError(list);
    const r = await this.writeCells(id, cells);
    const recalc = await this.costing.recalculate({ priceListId: id, cells });
    return { ...r, recalc };
  }

  // ── Supplier list history ────────────────────────────────────────────────────

  async history(supplierId: string) {
    const rows = await this.prisma.supplierPriceListAssignment.findMany({
      where: { supplierId },
      orderBy: { validFrom: 'desc' },
      include: { priceList: { select: { id: true, name: true, validTo: true } }, createdBy: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      priceList: { id: r.priceList.id, name: r.priceList.name, ended: !!r.priceList.validTo && r.priceList.validTo < todayCairo() },
      validFrom: isoDay(r.validFrom),
      validTo: r.validTo ? isoDay(r.validTo) : null,
      createdBy: r.createdBy?.name ?? null,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Put suppliers on `priceListId` from `from` (backdating allowed): their history is cut at
   * `from` and a new open-ended period starts. Their supplier-car jobs from that date are re-costed;
   * posted costs are left and reported. `priceListId = null` takes them off any list.
   */
  async moveSuppliers(dto: { supplierIds: string[]; priceListId: string | null; from: string }, userId?: string) {
    const supplierIds = [...new Set(dto.supplierIds ?? [])];
    if (!supplierIds.length) throw new BadRequestException('Pick at least one supplier');
    const from = day(dto.from);
    if (dto.priceListId) {
      const list = await this.get(dto.priceListId);
      if (from < list.validFrom) throw new BadRequestException(`"${list.name}" starts on ${isoDay(list.validFrom)} — pick that date or later`);
      if (list.validTo && from > list.validTo) throw new BadRequestException(`"${list.name}" ended on ${isoDay(list.validTo)} — extend it first or pick another list`);
    }
    const today = todayCairo();
    await this.prisma.$transaction(async (tx) => {
      for (const supplierId of supplierIds) {
        await tx.supplierPriceListAssignment.deleteMany({ where: { supplierId, validFrom: { gte: from } } });
        await tx.supplierPriceListAssignment.updateMany({
          where: { supplierId, validFrom: { lt: from }, OR: [{ validTo: null }, { validTo: { gte: from } }] },
          data: { validTo: addDays(from, -1) },
        });
        if (dto.priceListId) {
          await tx.supplierPriceListAssignment.create({
            data: { supplierId, priceListId: dto.priceListId, validFrom: from, validTo: null, createdById: userId ?? null },
          });
        }
        const current = await tx.supplierPriceListAssignment.findFirst({
          where: { supplierId, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
          orderBy: { validFrom: 'desc' },
          select: { priceListId: true },
        });
        await tx.supplier.update({ where: { id: supplierId }, data: { priceListId: current?.priceListId ?? null } });
      }
    });
    const recalc = await this.costing.recalculate({ supplierIds, from });
    return { moved: supplierIds.length, recalc };
  }

  // ── Alerts: ended lists that still price suppliers ───────────────────────────

  async alerts() {
    const today = todayCairo();
    const ended = await this.prisma.supplierPriceList.findMany({
      where: { validTo: { lt: today } },
      include: {
        assignments: {
          where: { validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }], supplier: { deletedAt: null } },
          select: { supplier: { select: { id: true, legalName: true, tradeName: true } } },
        },
      },
    });
    const out: { listId: string; name: string; endedOn: string; suppliers: string[]; ownCar: boolean }[] = [];
    const latestOwnCar = await this.prisma.supplierPriceList.findFirst({ where: { isOwnCarList: true, validFrom: { lte: today } }, orderBy: { validFrom: 'desc' } });
    for (const l of ended) {
      const ownCar = l.isOwnCarList && latestOwnCar?.id === l.id;
      if (!l.assignments.length && !ownCar) continue;
      out.push({
        listId: l.id,
        name: l.name,
        endedOn: isoDay(l.validTo!),
        suppliers: l.assignments.map((a) => a.supplier.tradeName || a.supplier.legalName),
        ownCar,
      });
    }
    return out;
  }

  /** 08:00 Cairo, one pod: notify admins + finance roles about ended lists still in use (once a week per list). */
  @Cron('0 8 * * *', { timeZone: 'Africa/Cairo' })
  async notifyEndedLists() {
    const runDate = todayCairo();
    try {
      await this.prisma.cronRunLock.create({ data: { jobName: 'price-list-ended-alert', runDate } });
    } catch {
      return; // another replica has it
    }
    const alerts = await this.alerts();
    if (!alerts.length) return;
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ role: 'ADMIN' }, { roleRef: { permissions: { some: { permissionKey: PRICE_LIST_ALERT_PERMISSION } } } }],
      },
      select: { id: true },
    });
    const weekAgo = addDays(new Date(), -7);
    for (const a of alerts) {
      const title = `Price list ended: ${a.name}`;
      const recent = await this.prisma.userNotification.findFirst({ where: { title, createdAt: { gte: weekAgo } }, select: { id: true } });
      if (recent) continue;
      const who = [a.suppliers.length && `${a.suppliers.length} supplier(s) still on it (${a.suppliers.slice(0, 5).join(', ')}${a.suppliers.length > 5 ? '…' : ''})`, a.ownCar && 'own cars are still costed from it']
        .filter(Boolean).join(' and ');
      const message = `${a.name} ended on ${a.endedOn}; ${who}. Its prices are still used — extend its end date or move them to a new list (Supplier Price Lists).`;
      await this.prisma.userNotification.createMany({ data: recipients.map((r) => ({ userId: r.id, title, message, type: 'GENERAL' as const })) });
      this.logger.log(`${title} — alerted ${recipients.length} user(s)`);
    }
  }

  // ── Excel ────────────────────────────────────────────────────────────────────

  /** All lists in the "Supplier R-T" layout: Price List | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | H-1 | Coaster | Bus | Route (AR). */
  async exportWorkbook(): Promise<Buffer> {
    const [lists, routes, cols] = await Promise.all([
      this.prisma.supplierPriceList.findMany({ orderBy: { name: 'asc' }, include: { items: true } }),
      this.prisma.jobServiceType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.columns(),
    ]);
    const rows: any[] = [];
    for (const l of lists) {
      for (const r of routes) {
        const row: any = { 'Price List': l.name, OPERATION: routeCode(r.name) };
        for (const c of cols) {
          const it = l.items.find((i) => i.jobServiceTypeId === r.id && i.vehicleTypeId === c.vehicleTypeId);
          row[c.header] = it ? Number(it.price) : null;
        }
        row['Route (AR)'] = r.name.split(' | ').slice(1).join(' | ');
        rows.push(row);
      }
    }
    return sheetBuffer(rows, ['Price List', 'OPERATION', ...cols.map((c) => c.header), 'Route (AR)'], 'Supplier R-T');
  }

  /**
   * Imports a "Supplier R-T" sheet (any workbook sheet with Price List + OPERATION headers).
   * Lists are matched by name; an unknown list is created starting today. An ended (read-only)
   * list is skipped and reported. OPERATION is matched to routes by their English half; a code
   * shared by two routes (the ذهاب / عوده pair) prices both. For every row in the file, the
   * car-type cells are authoritative: a number sets the price, an empty cell clears it.
   * Every list touched is then re-costed (posted costs reported).
   */
  async importWorkbook(buffer: Buffer) {
    const { grid, headerIdx, header } = findSheet(buffer, ['Price List', 'OPERATION']);
    const listCol = header.indexOf('pricelist');
    const opCol = header.indexOf('operation');
    const cols = priceColumnsIn(header, await this.prisma.vehicleType.findMany({ select: { id: true, name: true } }));
    const routesFor = await loadRouteIndex(this.prisma);

    const listIds = new Map<string, string | null>(); // null = read-only, skipped
    const unmatched = new Map<string, number>();
    let saved = 0;
    let cleared = 0;
    const createdLists: string[] = [];
    const readOnlyLists: string[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const row = grid[i] || [];
      const listName = String(row[listCol] ?? '').trim();
      const op = String(row[opCol] ?? '').trim();
      if (!listName || !op) continue;
      const routeIds = routesFor(op);
      if (routeIds.length === 0) {
        unmatched.set(op, (unmatched.get(op) || 0) + 1);
        continue;
      }
      if (!listIds.has(listName)) {
        let l = await this.prisma.supplierPriceList.findUnique({ where: { name: listName } });
        if (!l) {
          l = await this.prisma.supplierPriceList.create({ data: { name: listName, validFrom: todayCairo() } });
          createdLists.push(listName);
        }
        if (this.status(l) === 'ENDED') {
          readOnlyLists.push(listName);
          listIds.set(listName, null);
        } else listIds.set(listName, l.id);
      }
      const listId = listIds.get(listName);
      if (!listId) continue;
      const cells: PriceCell[] = [];
      for (const c of cols) {
        const price = parsePrice(row[c.idx]);
        for (const rid of routeIds) cells.push({ jobServiceTypeId: rid, vehicleTypeId: c.vehicleTypeId, price });
      }
      const r = await this.writeCells(listId, cells);
      saved += r.saved;
      cleared += r.cleared;
    }
    const reports: RecalcReport[] = [];
    for (const id of listIds.values()) if (id) reports.push(await this.costing.recalculate({ priceListId: id }));
    const recalc: RecalcReport = reports.reduce(
      (a, b) => ({
        jobs: a.jobs + b.jobs, costed: a.costed + b.costed, noPrice: a.noPrice + b.noPrice, noPriceList: a.noPriceList + b.noPriceList,
        postedUnchanged: a.postedUnchanged + b.postedUnchanged, postedDifferences: [...a.postedDifferences, ...b.postedDifferences],
      }),
      { jobs: 0, costed: 0, noPrice: 0, noPriceList: 0, postedUnchanged: 0, postedDifferences: [] },
    );
    return {
      lists: [...listIds.keys()],
      createdLists,
      readOnlyLists,
      pricesSaved: saved,
      pricesCleared: cleared,
      unmatchedOperations: [...unmatched.entries()].map(([operation, rows]) => ({ operation, rows })),
      recalc,
    };
  }
}
