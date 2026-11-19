import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { loadPriceFallback, priceTypes } from '../common/utils/route-price-sheet.util.js';

/** SupplierCost rows this service owns. Manual costs and complaint charges have source = null. */
export const PRICE_LIST_COST_SOURCE = 'PRICE_LIST';

export type CostSyncResult = 'COSTED' | 'NO_PRICE' | 'NO_PRICE_LIST' | 'NOT_SUPPLIER' | 'POSTED';

/** A posted cost the recalculation left alone because the new price differs. */
export interface PostedDifference {
  jobId: string;
  internalRef: string;
  jobDate: string;
  supplier: string;
  postedAmount: number;
  newAmount: number | null;
  difference: number | null;
}

export interface RecalcReport {
  jobs: number;
  costed: number;
  noPrice: number;
  noPriceList: number;
  postedUnchanged: number;
  postedDifferences: PostedDifference[];
}

const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Supplier cost from price lists (rules: docs/map/11-business-rules.md › Supplier price lists).
 *
 * - A supplier-car job (assignment has supplierId + supplierCarTypeId, no own vehicle) costs the
 *   price of its route × the car type's vehicle type on the list the supplier was on **on the job's
 *   date** (SupplierPriceListAssignment history). A list that has ended keeps pricing until the
 *   supplier is moved (finance / admin are alerted to extend it or move them).
 * - The cost is ONE SupplierCost row with source PRICE_LIST, recomputed whenever the job's route,
 *   supplier or car type changes, when a supplier's list changes from a date (backdated too) and
 *   when a list's prices change — but only while unposted: a posted row is settled pay and is never
 *   rewritten; a recalculation reports it (PostedDifference) for a manual adjustment.
 * - Own-car jobs are never a SupplierCost. Their notional cost comes from the own-car list in force
 *   on the job's date and is only reported (ownCarCostTotal).
 * - A car type without its own price uses its fallback type's (H-1 → Hi Ace 7; PRICE_FALLBACK_TYPE).
 */
@Injectable()
export class SupplierCostingService {
  private readonly logger = new Logger(SupplierCostingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The list a supplier was on on a date (its assignment covering that date), or null. */
  async listOn(supplierId: string, date: Date, db: any = this.prisma): Promise<string | null> {
    const d = dateOnly(date);
    const a = await db.supplierPriceListAssignment.findFirst({
      where: { supplierId, validFrom: { lte: d }, OR: [{ validTo: null }, { validTo: { gte: d } }] },
      orderBy: { validFrom: 'desc' },
      select: { priceListId: true },
    });
    return a?.priceListId ?? null;
  }

  /** What the job's supplier cost would be now (no write). */
  private async quote(db: any, jobId: string) {
    const job = await db.trafficJob.findUnique({
      where: { id: jobId },
      select: {
        jobDate: true,
        jobServiceTypeId: true,
        assignment: { select: { vehicleId: true, supplierId: true, supplierCarType: { select: { vehicleTypeId: true } } } },
      },
    });
    const a = job?.assignment;
    if (!job || !a?.supplierId || a.vehicleId || !a.supplierCarType) return { kind: 'NOT_SUPPLIER' as const };
    const listId = await this.listOn(a.supplierId, job.jobDate, db);
    if (!listId) return { kind: 'NO_PRICE_LIST' as const, supplierId: a.supplierId };
    if (!job.jobServiceTypeId) return { kind: 'NO_PRICE' as const, supplierId: a.supplierId };
    for (const vehicleTypeId of priceTypes(a.supplierCarType.vehicleTypeId, await loadPriceFallback(db))) {
      const item = await db.supplierPriceListItem.findUnique({
        where: { priceListId_jobServiceTypeId_vehicleTypeId: { priceListId: listId, jobServiceTypeId: job.jobServiceTypeId, vehicleTypeId } },
        select: { price: true, currency: true },
      });
      if (item) return { kind: 'PRICE' as const, supplierId: a.supplierId, price: item.price, currency: item.currency };
    }
    return { kind: 'NO_PRICE' as const, supplierId: a.supplierId };
  }

  /** Recompute one job's price-list cost. Never throws — a costing problem must not block dispatch. */
  async syncJobCost(trafficJobId: string): Promise<CostSyncResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const posted = await tx.supplierCost.findFirst({
          where: { trafficJobId, source: PRICE_LIST_COST_SOURCE, isPosted: true },
          select: { id: true },
        });
        if (posted) return 'POSTED';
        await tx.supplierCost.deleteMany({ where: { trafficJobId, source: PRICE_LIST_COST_SOURCE, isPosted: false } });
        const q = await this.quote(tx, trafficJobId);
        if (q.kind !== 'PRICE') return q.kind;
        await tx.supplierCost.create({
          data: { supplierId: q.supplierId, trafficJobId, amount: q.price, currency: q.currency, source: PRICE_LIST_COST_SOURCE },
        });
        return 'COSTED';
      });
    } catch (e: any) {
      this.logger.error(`Supplier cost sync failed for job ${trafficJobId}: ${e?.message}`);
      return 'NO_PRICE';
    }
  }

  /**
   * Re-cost supplier-car jobs: unposted costs are rewritten; posted ones are left and, when the new
   * price differs, reported. `filter` narrows the jobs (supplier ids / date range / list id).
   */
  async recalculate(filter: { supplierIds?: string[]; from?: Date; to?: Date; priceListId?: string; cells?: { jobServiceTypeId: string; vehicleTypeId: string }[] }): Promise<RecalcReport> {
    let supplierIds = filter.supplierIds;
    if (filter.priceListId) {
      const rows = await this.prisma.supplierPriceListAssignment.findMany({ where: { priceListId: filter.priceListId }, select: { supplierId: true } });
      supplierIds = [...new Set(rows.map((r) => r.supplierId))];
    }
    const jobs = await this.prisma.trafficJob.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        ...(filter.from || filter.to ? { jobDate: { ...(filter.from && { gte: dateOnly(filter.from) }), ...(filter.to && { lte: dateOnly(filter.to) }) } } : {}),
        ...(filter.cells?.length ? { jobServiceTypeId: { in: [...new Set(filter.cells.map((c) => c.jobServiceTypeId))] } } : {}),
        assignment: { vehicleId: null, supplierCarTypeId: { not: null }, ...(supplierIds ? { supplierId: { in: supplierIds } } : { supplierId: { not: null } }) },
      },
      select: {
        id: true, internalRef: true, jobDate: true,
        assignment: { select: { supplierId: true, supplier: { select: { legalName: true, tradeName: true } } } },
      },
      orderBy: { jobDate: 'asc' },
    });

    const report: RecalcReport = { jobs: 0, costed: 0, noPrice: 0, noPriceList: 0, postedUnchanged: 0, postedDifferences: [] };
    for (const j of jobs) {
      // A list price edit only touches jobs whose supplier was on that list on the job's date.
      if (filter.priceListId && (await this.listOn(j.assignment!.supplierId!, j.jobDate)) !== filter.priceListId) continue;
      report.jobs++;
      const r = await this.syncJobCost(j.id);
      if (r === 'COSTED') report.costed++;
      else if (r === 'NO_PRICE') report.noPrice++;
      else if (r === 'NO_PRICE_LIST') report.noPriceList++;
      else if (r === 'POSTED') {
        const [posted, q] = await Promise.all([
          this.prisma.supplierCost.findFirst({ where: { trafficJobId: j.id, source: PRICE_LIST_COST_SOURCE, isPosted: true }, select: { amount: true } }),
          this.quote(this.prisma, j.id),
        ]);
        const postedAmount = Number(posted?.amount ?? 0);
        const newAmount = q.kind === 'PRICE' ? Number(q.price) : null;
        if (newAmount === postedAmount) report.postedUnchanged++;
        else {
          report.postedDifferences.push({
            jobId: j.id,
            internalRef: j.internalRef,
            jobDate: j.jobDate.toISOString().slice(0, 10),
            supplier: j.assignment?.supplier?.tradeName || j.assignment?.supplier?.legalName || '',
            postedAmount,
            newAmount,
            difference: newAmount === null ? null : Math.round((newAmount - postedAmount) * 100) / 100,
          });
        }
      }
    }
    return report;
  }

  /**
   * Sum of own-car jobs' notional cost, for profit reports: each job is priced on the own-car list
   * in force on its date (the latest own-car list that had started by then).
   */
  async ownCarCostTotal(fromDate: Date, toDate: Date): Promise<number> {
    const lists = await this.prisma.supplierPriceList.findMany({
      where: { isOwnCarList: true },
      select: { id: true, validFrom: true },
      orderBy: { validFrom: 'desc' },
    });
    if (!lists.length) return 0;
    const [groups, items, fallback] = await Promise.all([
      this.prisma.$queryRaw<{ route: string; type: string; day: Date; n: number }[]>`
        SELECT j.job_service_type_id AS route, v.vehicle_type_id AS type, j.job_date AS day, COUNT(*)::int AS n
        FROM traffic_jobs j
        JOIN traffic_assignments a ON a.traffic_job_id = j.id AND a.vehicle_id IS NOT NULL
        JOIN vehicles v ON v.id = a.vehicle_id
        WHERE j.deleted_at IS NULL AND j.job_date BETWEEN ${fromDate} AND ${toDate}
          AND j.status NOT IN ('CANCELLED') AND j.job_service_type_id IS NOT NULL
        GROUP BY 1, 2, 3`,
      this.prisma.supplierPriceListItem.findMany({
        where: { priceListId: { in: lists.map((l) => l.id) } },
        select: { priceListId: true, jobServiceTypeId: true, vehicleTypeId: true, price: true },
      }),
      loadPriceFallback(this.prisma),
    ]);
    const price = new Map(items.map((i) => [`${i.priceListId}|${i.jobServiceTypeId}|${i.vehicleTypeId}`, Number(i.price)]));
    let total = 0;
    for (const g of groups) {
      const list = lists.find((l) => l.validFrom <= new Date(g.day)) ?? lists[lists.length - 1];
      const p = priceTypes(g.type, fallback).map((t) => price.get(`${list.id}|${g.route}|${t}`)).find((v) => v !== undefined);
      if (p !== undefined) total += p * Number(g.n);
    }
    return Math.round(total * 100) / 100;
  }
}
