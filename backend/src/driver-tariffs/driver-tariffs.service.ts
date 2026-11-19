import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RouteRateTable, type RouteRateCell } from '../job-pricing/route-rate-table.js';
import { loadPriceFallback, priceTypes } from '../common/utils/route-price-sheet.util.js';

/**
 * Driver tariffs — what a driver earns for a trip (rules: docs/map/11-business-rules.md › Driver
 * tariffs). One table for every driver: route (JobServiceType) × car type, in the traffic sheets'
 * layout (No. | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | H-1 | Coaster | Bus). A trip fee is the job's route × the assigned vehicle's type (H-1 falls back to
 * Hi Ace 7 like every price table). Replaced the zone-based DriverPriceTariff on 2026-11-19 (it never
 * had a row, so every fee was 0).
 */
@Injectable()
export class DriverTariffsService {
  readonly table: RouteRateTable;

  constructor(private readonly prisma: PrismaService) {
    this.table = new RouteRateTable(prisma, 'driverTariffRate', { name: 'Driver Tariffs', match: /tariff/i });
  }

  grid() {
    return this.table.grid();
  }

  saveCells(cells: RouteRateCell[]) {
    return this.table.saveCells(cells);
  }

  exportSheet() {
    return this.table.exportSheet();
  }

  importSheet(buffer: Buffer) {
    return this.table.importSheet(buffer);
  }

  /** The tariff for a route × vehicle type, or null (H-1 → Hi Ace 7 fallback). */
  async rateFor(jobServiceTypeId: string | null | undefined, vehicleTypeId: string | null | undefined, db: any = this.prisma) {
    if (!jobServiceTypeId || !vehicleTypeId) return null;
    for (const t of priceTypes(vehicleTypeId, await loadPriceFallback(db))) {
      const r = await db.driverTariffRate.findUnique({
        where: { jobServiceTypeId_vehicleTypeId: { jobServiceTypeId, vehicleTypeId: t } },
        select: { amount: true, currency: true },
      });
      if (r) return { amount: Number(r.amount), currency: r.currency };
    }
    return null;
  }

  /**
   * DriverTripFee create-data for a completed job: the job's route × the assigned vehicle's type.
   * Returns null when the job has no route (no fee row is made). No tariff for that cell → amount 0,
   * which a later recalculation (traffic-jobs.service › recalculateDriverFees) re-prices.
   */
  async resolveJobTripFee(
    job: {
      jobServiceTypeId?: string | null;
      fromZoneId?: string | null;
      toZoneId?: string | null;
      originZoneId?: string | null;
      destinationZoneId?: string | null;
      originAirportId?: string | null;
      destinationAirportId?: string | null;
    },
    vehicleId: string | null | undefined,
    db: any = this.prisma,
  ) {
    if (!job.jobServiceTypeId) return null;
    let vehicleTypeId: string | null = null;
    if (vehicleId) {
      const v = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { vehicleTypeId: true } });
      vehicleTypeId = v?.vehicleTypeId ?? null;
    }
    const rate = await this.rateFor(job.jobServiceTypeId, vehicleTypeId, db);
    const amount = rate?.amount ?? 0;
    return {
      fromZoneId: (job.fromZoneId ?? job.originZoneId) ?? undefined,
      toZoneId: (job.toZoneId ?? job.destinationZoneId) ?? undefined,
      fromAirportId: job.originAirportId ?? undefined,
      toAirportId: job.destinationAirportId ?? undefined,
      vehicleTypeId: vehicleTypeId ?? undefined,
      amount,
      tariffAmount: amount, // amount == tariffAmount marks a fee nobody edited: recalculation may re-price it
      currency: (rate?.currency ?? 'EGP') as any,
    };
  }
}
