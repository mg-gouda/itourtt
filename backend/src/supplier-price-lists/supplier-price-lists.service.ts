import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeImportName } from '../common/utils/import-name.util.js';

/**
 * Car-type columns of the traffic team's "Supplier R-T" sheet, in sheet order,
 * and the system vehicle type each one prices.
 */
export const PRICE_COLUMNS = [
  { header: 'Limo', vehicleType: 'Sedan' },
  { header: 'Hi Ace 7', vehicleType: 'Minivan 7' },
  { header: 'Hi Ace 15', vehicleType: 'Hi Ace' },
  { header: 'Coaster', vehicleType: 'Coaster' },
  { header: 'Bus', vehicleType: 'Bus' },
] as const;

/** English half of a route name ("ARR-HRG | وصول داخلي" → "ARR-HRG"), the sheet's OPERATION. */
function routeCode(name: string) {
  return name.split(' | ')[0].trim();
}

export interface PriceCell {
  jobServiceTypeId: string;
  vehicleTypeId: string;
  price: number | null; // null clears
}

@Injectable()
export class SupplierPriceListsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const lists = await this.prisma.supplierPriceList.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { items: true } },
        suppliers: { where: { deletedAt: null }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: 'asc' } },
      },
    });
    return lists.map(({ _count, ...l }) => ({ ...l, itemCount: _count.items }));
  }

  async create(dto: { name: string; isDefaultForNew?: boolean; isOwnCarList?: boolean; notes?: string }) {
    const name = dto.name.trim();
    if (await this.prisma.supplierPriceList.findUnique({ where: { name } })) {
      throw new ConflictException(`Price list "${name}" already exists`);
    }
    return this.prisma.$transaction(async (tx) => {
      await this.clearExclusiveFlags(tx, dto);
      return tx.supplierPriceList.create({
        data: { name, isDefaultForNew: !!dto.isDefaultForNew, isOwnCarList: !!dto.isOwnCarList, notes: dto.notes ?? null },
      });
    });
  }

  async update(id: string, dto: { name?: string; isDefaultForNew?: boolean; isOwnCarList?: boolean; notes?: string | null }) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      await this.clearExclusiveFlags(tx, dto, id);
      return tx.supplierPriceList.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.isDefaultForNew !== undefined && { isDefaultForNew: dto.isDefaultForNew }),
          ...(dto.isOwnCarList !== undefined && { isOwnCarList: dto.isOwnCarList }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });
    });
  }

  /** Only one list can be the default for new suppliers, and only one the own-car list. */
  private async clearExclusiveFlags(tx: any, dto: { isDefaultForNew?: boolean; isOwnCarList?: boolean }, exceptId?: string) {
    const not = exceptId ? { id: { not: exceptId } } : {};
    if (dto.isDefaultForNew) await tx.supplierPriceList.updateMany({ where: { ...not, isDefaultForNew: true }, data: { isDefaultForNew: false } });
    if (dto.isOwnCarList) await tx.supplierPriceList.updateMany({ where: { ...not, isOwnCarList: true }, data: { isOwnCarList: false } });
  }

  async remove(id: string) {
    const list = await this.prisma.supplierPriceList.findUnique({
      where: { id },
      include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
    });
    if (!list) throw new NotFoundException('Price list not found');
    if (list._count.suppliers > 0) {
      throw new BadRequestException(`${list._count.suppliers} supplier(s) still use "${list.name}" — move them to another list first`);
    }
    await this.prisma.supplierPriceList.delete({ where: { id } });
    return { deleted: true };
  }

  private async get(id: string) {
    const list = await this.prisma.supplierPriceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
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
      list,
      columns: cols.filter((c) => c.vehicleTypeId),
      routes,
      prices: items.map((i) => ({ jobServiceTypeId: i.jobServiceTypeId, vehicleTypeId: i.vehicleTypeId, price: Number(i.price) })),
    };
  }

  /** Saves edited grid cells; a null/0 price removes the cell. */
  async saveCells(id: string, cells: PriceCell[]) {
    await this.get(id);
    let saved = 0;
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of cells) {
        const key = { priceListId_jobServiceTypeId_vehicleTypeId: { priceListId: id, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId } };
        if (c.price === null || !(c.price > 0)) {
          const r = await tx.supplierPriceListItem.deleteMany({ where: { priceListId: id, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId } });
          cleared += r.count;
        } else {
          await tx.supplierPriceListItem.upsert({
            where: key,
            create: { priceListId: id, jobServiceTypeId: c.jobServiceTypeId, vehicleTypeId: c.vehicleTypeId, price: c.price },
            update: { price: c.price },
          });
          saved++;
        }
      }
    });
    return { saved, cleared };
  }

  /** All lists in the "Supplier R-T" layout: Price List | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | Coaster | Bus | Route (AR). */
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
    const ws = XLSX.utils.json_to_sheet(rows, { header: ['Price List', 'OPERATION', ...cols.map((c) => c.header), 'Route (AR)'] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier R-T');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Imports a "Supplier R-T" sheet (any workbook sheet with Price List + OPERATION headers).
   * Lists are matched (or created) by name. OPERATION is matched to routes by their English half;
   * a code shared by two routes (the ذهاب / عوده pair) prices both. For every row in the file, the
   * car-type cells are authoritative: a number sets the price, an empty cell clears it.
   */
  async importWorkbook(buffer: Buffer) {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Could not read the file');
    }
    let grid: any[][] | null = null;
    let headerIdx = -1;
    for (const n of wb.SheetNames) {
      const g = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1, raw: true, defval: null });
      const i = g.findIndex((r) => (r || []).map((c) => normalizeImportName(c)).includes('operation'));
      if (i !== -1 && (g[i] || []).some((c) => normalizeImportName(c) === 'pricelist')) {
        grid = g;
        headerIdx = i;
        break;
      }
    }
    if (!grid) throw new BadRequestException('No sheet with "Price List" and "OPERATION" columns found');
    const header = grid[headerIdx].map((c) => normalizeImportName(c));
    const listCol = header.indexOf('pricelist');
    const opCol = header.indexOf('operation');
    const cols = (await this.columns()).map((c) => ({ ...c, idx: header.indexOf(normalizeImportName(c.header)) })).filter((c) => c.idx !== -1 && c.vehicleTypeId);

    const routes = await this.prisma.jobServiceType.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const byCode = new Map<string, string[]>();
    for (const r of routes) {
      const k = normalizeImportName(routeCode(r.name));
      byCode.set(k, [...(byCode.get(k) || []), r.id]);
    }

    const listIds = new Map<string, string>();
    const unmatched = new Map<string, number>();
    let saved = 0;
    let cleared = 0;
    const createdLists: string[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const row = grid[i] || [];
      const listName = String(row[listCol] ?? '').trim();
      const op = String(row[opCol] ?? '').trim();
      if (!listName || !op) continue;
      const routeIds = byCode.get(normalizeImportName(op));
      if (!routeIds) {
        unmatched.set(op, (unmatched.get(op) || 0) + 1);
        continue;
      }
      if (!listIds.has(listName)) {
        let l = await this.prisma.supplierPriceList.findUnique({ where: { name: listName } });
        if (!l) {
          l = await this.prisma.supplierPriceList.create({ data: { name: listName } });
          createdLists.push(listName);
        }
        listIds.set(listName, l.id);
      }
      const cells: PriceCell[] = [];
      for (const c of cols) {
        const v = row[c.idx];
        const price = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, '')) || null;
        for (const rid of routeIds) cells.push({ jobServiceTypeId: rid, vehicleTypeId: c.vehicleTypeId!, price });
      }
      const r = await this.saveCells(listIds.get(listName)!, cells);
      saved += r.saved;
      cleared += r.cleared;
    }
    return {
      lists: [...listIds.keys()],
      createdLists,
      pricesSaved: saved,
      pricesCleared: cleared,
      unmatchedOperations: [...unmatched.entries()].map(([operation, rows]) => ({ operation, rows })),
    };
  }
}
