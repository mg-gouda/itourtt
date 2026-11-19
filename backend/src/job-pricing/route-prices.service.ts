import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeImportName } from '../common/utils/import-name.util.js';
import {
  PRICE_COLUMNS, findSheet, loadRouteIndex, parsePrice, priceColumnsIn, routeCode, sheetBuffer,
} from '../common/utils/route-price-sheet.util.js';

export interface RoutePriceCell {
  jobServiceTypeId: string;
  vehicleTypeId: string;
  price: number | null; // null clears
}

/**
 * Customer route prices (per customer) — a route × car-type grid, imported/exported in the
 * traffic team's own "Customer Price List" layout (CUST | OPERATION | Limo…).
 */
@Injectable()
export class RoutePricesService {
  constructor(private readonly prisma: PrismaService) {}

  private async columns() {
    const types = await this.prisma.vehicleType.findMany({ select: { id: true, name: true } });
    return PRICE_COLUMNS.map((c) => ({ ...c, vehicleTypeId: types.find((t) => t.name === c.vehicleType)?.id ?? null }))
      .filter((c) => c.vehicleTypeId) as { header: string; vehicleType: string; vehicleTypeId: string }[];
  }

  private routes() {
    return this.prisma.jobServiceType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  // ── Customer prices ────────────────────────────────────────────────────────

  async customerGrid(customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true, legalName: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    const [columns, routes, items] = await Promise.all([
      this.columns(),
      this.routes(),
      this.prisma.customerRoutePrice.findMany({ where: { customerId }, select: { jobServiceTypeId: true, vehicleTypeId: true, price: true } }),
    ]);
    return { columns, routes, prices: items.map((i) => ({ ...i, price: Number(i.price) })) };
  }

  async saveCustomerCells(customerId: string, cells: RoutePriceCell[]) {
    let saved = 0;
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of cells) {
        if (c.price === null || !(c.price > 0)) {
          cleared += (await tx.customerRoutePrice.deleteMany({ where: { customerId, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId } })).count;
          continue;
        }
        await tx.customerRoutePrice.upsert({
          where: { customerId_jobServiceTypeId_vehicleTypeId: { customerId, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId } },
          create: { customerId, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId, price: c.price },
          update: { price: c.price },
        });
        saved++;
      }
    });
    return { saved, cleared };
  }

  /** All customers that have prices, in the "Customer Price List" layout (+ the Arabic route). */
  async exportCustomerPrices(): Promise<Buffer> {
    const [columns, routes, customers] = await Promise.all([
      this.columns(),
      this.routes(),
      this.prisma.customer.findMany({
        where: { deletedAt: null, routePrices: { some: {} } },
        select: { legalName: true, tradeName: true, routePrices: { select: { jobServiceTypeId: true, vehicleTypeId: true, price: true } } },
        orderBy: { legalName: 'asc' },
      }),
    ]);
    const rows: Record<string, unknown>[] = [];
    for (const c of customers) {
      for (const r of routes) {
        const row: Record<string, unknown> = { CUST: c.tradeName || c.legalName, OPERATION: routeCode(r.name) };
        for (const col of columns) {
          const p = c.routePrices.find((x) => x.jobServiceTypeId === r.id && x.vehicleTypeId === col.vehicleTypeId);
          row[col.header] = p ? Number(p.price) : null;
        }
        row['Route (AR)'] = r.name.split(' | ').slice(1).join(' | ');
        rows.push(row);
      }
    }
    return sheetBuffer(rows, ['CUST', 'OPERATION', ...columns.map((c) => c.header), 'Route (AR)'], 'Customer Price List');
  }

  /**
   * Imports a "Customer Price List" sheet. CUST is matched like the B2B import matches customers
   * (legal/trade name, normalised, remembered CUSTOMER aliases). For every row, a number sets the
   * price and an empty cell clears it. Unknown customers / operations are reported, never created.
   */
  async importCustomerPrices(buffer: Buffer) {
    const { grid, headerIdx, header } = findSheet(buffer, ['CUST', 'OPERATION']);
    const custCol = header.indexOf('cust');
    const opCol = header.indexOf('operation');
    const cols = priceColumnsIn(header, await this.prisma.vehicleType.findMany({ select: { id: true, name: true } }));
    const routesFor = await loadRouteIndex(this.prisma);
    const [customers, aliases] = await Promise.all([
      this.prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, legalName: true, tradeName: true } }),
      this.prisma.importNameAlias.findMany({ where: { kind: 'CUSTOMER' }, select: { normalizedName: true, targetId: true } }),
    ]);
    const byName = new Map<string, Set<string>>();
    for (const c of customers) {
      for (const n of [c.legalName, c.tradeName]) {
        const k = normalizeImportName(n);
        if (k) byName.set(k, new Set([...(byName.get(k) || []), c.id]));
      }
    }
    const aliasMap = new Map(aliases.map((a) => [a.normalizedName, a.targetId]));
    const customerFor = (name: string) => {
      const k = normalizeImportName(name);
      const ids = aliasMap.has(k) ? new Set([aliasMap.get(k)!]) : byName.get(k);
      return ids && ids.size === 1 ? [...ids][0] : null;
    };

    const unmatchedCustomers = new Map<string, number>();
    const unmatchedOperations = new Map<string, number>();
    const touched = new Set<string>();
    let saved = 0;
    let cleared = 0;
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const row = grid[i] || [];
      const cust = String(row[custCol] ?? '').trim();
      const op = String(row[opCol] ?? '').trim();
      if (!cust || !op) continue;
      const customerId = customerFor(cust);
      if (!customerId) { unmatchedCustomers.set(cust, (unmatchedCustomers.get(cust) || 0) + 1); continue; }
      const routeIds = routesFor(op);
      if (routeIds.length === 0) { unmatchedOperations.set(op, (unmatchedOperations.get(op) || 0) + 1); continue; }
      const cells: RoutePriceCell[] = [];
      for (const c of cols) for (const rid of routeIds) cells.push({ jobServiceTypeId: rid, vehicleTypeId: c.vehicleTypeId, price: parsePrice(row[c.idx]) });
      const r = await this.saveCustomerCells(customerId, cells);
      saved += r.saved;
      cleared += r.cleared;
      touched.add(customerId);
    }
    return {
      customers: touched.size,
      pricesSaved: saved,
      pricesCleared: cleared,
      unmatchedCustomers: [...unmatchedCustomers.entries()].map(([name, rows]) => ({ name, rows })),
      unmatchedOperations: [...unmatchedOperations.entries()].map(([operation, rows]) => ({ operation, rows })),
    };
  }
}
