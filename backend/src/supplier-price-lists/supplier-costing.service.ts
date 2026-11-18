import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** SupplierCost rows this service owns. Manual costs and complaint charges have source = null. */
export const PRICE_LIST_COST_SOURCE = 'PRICE_LIST';

export type CostSyncResult = 'COSTED' | 'NO_PRICE' | 'NO_PRICE_LIST' | 'NOT_SUPPLIER' | 'POSTED';

/**
 * Supplier cost from price lists (rules: docs/map/11-business-rules.md › Supplier price lists).
 *
 * - A supplier-car job (assignment has supplierId + supplierCarTypeId, no own vehicle) costs the
 *   price of its route × the car type's vehicle type on the supplier's price list.
 * - The cost is ONE SupplierCost row with source PRICE_LIST. It is recomputed whenever the job's
 *   route, supplier or car type changes — but only while unposted: a posted row is settled pay and
 *   is never rewritten. Manual rows and complaint charges (source null) are never touched.
 * - Own-car jobs are never a SupplierCost (those become Odoo vendor bills). Their notional cost
 *   comes from the list flagged isOwnCarList and is only reported (ownCarCostTotal).
 */
@Injectable()
export class SupplierCostingService {
  private readonly logger = new Logger(SupplierCostingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Recompute one job's price-list cost. Never throws — a costing problem must not block dispatch. */
  async syncJobCost(trafficJobId: string): Promise<CostSyncResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const job = await tx.trafficJob.findUnique({
          where: { id: trafficJobId },
          select: {
            jobServiceTypeId: true,
            assignment: {
              select: {
                vehicleId: true,
                supplierId: true,
                supplier: { select: { priceListId: true } },
                supplierCarType: { select: { vehicleTypeId: true } },
              },
            },
            supplierCosts: { where: { source: PRICE_LIST_COST_SOURCE }, select: { id: true, isPosted: true } },
          },
        });
        if (!job) return 'NOT_SUPPLIER';
        if (job.supplierCosts.some((c) => c.isPosted)) return 'POSTED';

        await tx.supplierCost.deleteMany({
          where: { trafficJobId, source: PRICE_LIST_COST_SOURCE, isPosted: false },
        });

        const a = job.assignment;
        if (!a?.supplierId || a.vehicleId || !a.supplierCarType) return 'NOT_SUPPLIER';
        if (!a.supplier?.priceListId) return 'NO_PRICE_LIST';
        if (!job.jobServiceTypeId) return 'NO_PRICE';

        const item = await tx.supplierPriceListItem.findUnique({
          where: {
            priceListId_jobServiceTypeId_vehicleTypeId: {
              priceListId: a.supplier.priceListId,
              jobServiceTypeId: job.jobServiceTypeId,
              vehicleTypeId: a.supplierCarType.vehicleTypeId,
            },
          },
          select: { price: true, currency: true },
        });
        if (!item) return 'NO_PRICE';

        await tx.supplierCost.create({
          data: {
            supplierId: a.supplierId,
            trafficJobId,
            amount: item.price,
            currency: item.currency,
            source: PRICE_LIST_COST_SOURCE,
          },
        });
        return 'COSTED';
      });
    } catch (e: any) {
      this.logger.error(`Supplier cost sync failed for job ${trafficJobId}: ${e?.message}`);
      return 'NO_PRICE';
    }
  }

  /** Sum of own-car jobs' prices on the own-car list (route × the vehicle's type), for profit reports. */
  async ownCarCostTotal(fromDate: Date, toDate: Date): Promise<number> {
    const list = await this.prisma.supplierPriceList.findFirst({ where: { isOwnCarList: true }, select: { id: true } });
    if (!list) return 0;
    const rows = await this.prisma.$queryRaw<{ total: string | null }[]>`
      SELECT SUM(i.price)::text AS total
      FROM traffic_jobs j
      JOIN traffic_assignments a ON a.traffic_job_id = j.id AND a.vehicle_id IS NOT NULL
      JOIN vehicles v ON v.id = a.vehicle_id
      JOIN supplier_price_list_items i
        ON i.price_list_id = ${list.id} AND i.job_service_type_id = j.job_service_type_id AND i.vehicle_type_id = v.vehicle_type_id
      WHERE j.deleted_at IS NULL AND j.job_date BETWEEN ${fromDate} AND ${toDate}
        AND j.status NOT IN ('CANCELLED')`;
    return Number(rows[0]?.total ?? 0);
  }
}
