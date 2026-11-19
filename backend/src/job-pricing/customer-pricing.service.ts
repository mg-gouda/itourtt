import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { loadPriceFallback, priceTypes } from '../common/utils/route-price-sheet.util.js';

export type PriceSyncResult = 'PRICED' | 'NO_PRICE' | 'MANUAL' | 'INVOICED' | 'NOT_B2B';

const JOB_PRICING_SELECT = {
  id: true,
  bookingChannel: true,
  customerId: true,
  jobServiceTypeId: true,
  requestedVehicleTypeId: true,
  priceAmount: true,
  priceManual: true,
  assignment: {
    select: {
      vehicle: { select: { vehicleTypeId: true } },
      supplierCarType: { select: { vehicleTypeId: true } },
    },
  },
} as const;

/** The car type a job is priced at: own vehicle → supplier car type → requested type. */
function pricedVehicleTypeId(job: any): string | null {
  return job.assignment?.vehicle?.vehicleTypeId ?? job.assignment?.supplierCarType?.vehicleTypeId ?? job.requestedVehicleTypeId ?? null;
}

/**
 * B2B customer prices (rules: docs/map/11-business-rules.md › Customer prices).
 *
 * - A B2B job's price is its customer's CustomerRoutePrice for route × car type.
 * - syncJobPrice keeps TrafficJob.priceAmount in step on create / import / route or car change,
 *   until a person types a price (priceManual) or the job is on an invoice — then it stops.
 * - A car type without a price of its own uses its fallback type's (H-1 → Hi Ace 7; PRICE_FALLBACK_TYPE).
 */
@Injectable()
export class CustomerPricingService {
  private readonly logger = new Logger(CustomerPricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws — pricing must not block dispatch or the import. */
  async syncJobPrice(trafficJobId: string): Promise<PriceSyncResult> {
    try {
      const job = await this.prisma.trafficJob.findUnique({
        where: { id: trafficJobId },
        select: { ...JOB_PRICING_SELECT, _count: { select: { invoiceLines: true } } },
      });
      if (!job || job.bookingChannel !== 'B2B' || !job.customerId) return 'NOT_B2B';
      if (job.priceManual) return 'MANUAL';
      if (job._count.invoiceLines > 0) return 'INVOICED';

      let item: { price: any; currency: any } | null = null;
      if (job.jobServiceTypeId) {
        for (const vehicleTypeId of priceTypes(pricedVehicleTypeId(job), await loadPriceFallback(this.prisma))) {
          item = await this.prisma.customerRoutePrice.findUnique({
            where: {
              customerId_jobServiceTypeId_vehicleTypeId: {
                customerId: job.customerId,
                jobServiceTypeId: job.jobServiceTypeId,
                vehicleTypeId,
              },
            },
            select: { price: true, currency: true },
          });
          if (item) break;
        }
      }
      await this.prisma.trafficJob.update({
        where: { id: trafficJobId },
        data: item ? { priceAmount: item.price, priceCurrency: item.currency } : { priceAmount: null },
      });
      return item ? 'PRICED' : 'NO_PRICE';
    } catch (e: any) {
      this.logger.error(`Customer price sync failed for job ${trafficJobId}: ${e?.message}`);
      return 'NO_PRICE';
    }
  }

  /** Invoice amount per job: the job's own price if it has one, else the customer's route price; missing → 0. */
  async quote(customerId: string, jobIds: string[]): Promise<Map<string, { transferPrice: number }>> {
    const [jobs, prices, fallback] = await Promise.all([
      this.prisma.trafficJob.findMany({ where: { id: { in: jobIds } }, select: JOB_PRICING_SELECT }),
      this.prisma.customerRoutePrice.findMany({ where: { customerId }, select: { jobServiceTypeId: true, vehicleTypeId: true, price: true } }),
      loadPriceFallback(this.prisma),
    ]);
    const key = (r: string | null, v: string | null) => `${r}|${v}`;
    const priceMap = new Map(prices.map((p) => [key(p.jobServiceTypeId, p.vehicleTypeId), Number(p.price)]));
    const find = (m: Map<string, number>, route: string | null, types: string[]) => {
      for (const t of types) {
        const v = m.get(key(route, t));
        if (v !== undefined) return v;
      }
      return undefined;
    };
    const out = new Map<string, { transferPrice: number }>();
    for (const j of jobs) {
      const types = priceTypes(pricedVehicleTypeId(j), fallback);
      out.set(j.id, {
        transferPrice: j.priceAmount != null ? Number(j.priceAmount) : find(priceMap, j.jobServiceTypeId, types) ?? 0,
      });
    }
    return out;
  }
}
