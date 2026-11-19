import type { PrismaService } from '../prisma/prisma.service.js';
import {
  PRICE_COLUMNS, findSheet, loadRouteIndex, parsePrice, priceColumnsIn, routeCode, sheetBuffer,
} from '../common/utils/route-price-sheet.util.js';

export interface RouteRateCell {
  jobServiceTypeId: string;
  vehicleTypeId: string;
  price: number | null; // null clears
}

/** Global route × car-type tables of the shape (route, vehicle type) → amount. */
type RateModel = 'driverTariffRate';

/**
 * One global route × car-type amount table in the traffic sheets' layout
 * (`No. | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | H-1 | Coaster | Bus | Route (AR)`).
 * Used by the driver tariffs (a driver's trip fee).
 */
export class RouteRateTable {
  constructor(
    private readonly prisma: PrismaService,
    private readonly model: RateModel,
    /** Sheet name for export; `match` picks the sheet on import (a lone sheet is always accepted). */
    private readonly sheet: { name: string; match: RegExp },
  ) {}

  private get rows(): any {
    return (this.prisma as any)[this.model];
  }

  async grid() {
    const [types, routes, items] = await Promise.all([
      this.prisma.vehicleType.findMany({ select: { id: true, name: true } }),
      this.prisma.jobServiceType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.rows.findMany({ select: { jobServiceTypeId: true, vehicleTypeId: true, amount: true } }),
    ]);
    const columns = PRICE_COLUMNS.map((c) => ({ ...c, vehicleTypeId: types.find((t) => t.name === c.vehicleType)?.id ?? null }))
      .filter((c) => c.vehicleTypeId) as { header: string; vehicleType: string; note?: string; vehicleTypeId: string }[];
    return {
      columns,
      routes,
      prices: items.map((i: any) => ({ jobServiceTypeId: i.jobServiceTypeId, vehicleTypeId: i.vehicleTypeId, price: Number(i.amount) })),
    };
  }

  async saveCells(cells: RouteRateCell[]) {
    let saved = 0;
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      const rows = (tx as any)[this.model];
      for (const c of cells) {
        const key = { jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId };
        if (c.price === null || !(c.price > 0)) {
          cleared += (await rows.deleteMany({ where: key })).count;
          continue;
        }
        await rows.upsert({ where: { jobServiceTypeId_vehicleTypeId: key }, create: { ...key, amount: c.price }, update: { amount: c.price } });
        saved++;
      }
    });
    return { saved, cleared };
  }

  async exportSheet(): Promise<Buffer> {
    const g = await this.grid();
    const rows = g.routes.map((r, i) => {
      const row: Record<string, unknown> = { 'No.': i + 1, OPERATION: routeCode(r.name) };
      for (const c of g.columns) row[c.header] = g.prices.find((p: any) => p.jobServiceTypeId === r.id && p.vehicleTypeId === c.vehicleTypeId)?.price ?? null;
      row['Route (AR)'] = r.name.split(' | ').slice(1).join(' | ');
      return row;
    });
    return sheetBuffer(rows, ['No.', 'OPERATION', ...g.columns.map((c) => c.header), 'Route (AR)'], this.sheet.name);
  }

  /** For a row in the file, a number sets the amount and an empty cell clears it; unknown operations are reported. */
  async importSheet(buffer: Buffer) {
    // The whole traffic workbook may be uploaded: only the sheet named for this table is read, and
    // never a Customer Price List (CUST) or Supplier R-T (Price List) sheet.
    const { grid, headerIdx, header } = findSheet(buffer, ['OPERATION'], { only: this.sheet.match, forbid: ['CUST', 'Price List'] });
    const opCol = header.indexOf('operation');
    const cols = priceColumnsIn(header, await this.prisma.vehicleType.findMany({ select: { id: true, name: true } }));
    const routesFor = await loadRouteIndex(this.prisma);
    const unmatched = new Map<string, number>();
    const cells: RouteRateCell[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const row = grid[i] || [];
      const op = String(row[opCol] ?? '').trim();
      if (!op) continue;
      const routeIds = routesFor(op);
      if (routeIds.length === 0) { unmatched.set(op, (unmatched.get(op) || 0) + 1); continue; }
      for (const c of cols) for (const rid of routeIds) cells.push({ jobServiceTypeId: rid, vehicleTypeId: c.vehicleTypeId, price: parsePrice(row[c.idx]) });
    }
    const r = await this.saveCells(cells);
    return { pricesSaved: r.saved, pricesCleared: r.cleared, unmatchedOperations: [...unmatched.entries()].map(([operation, rows]) => ({ operation, rows })) };
  }
}
