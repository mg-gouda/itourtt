import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { normalizeImportName } from './import-name.util.js';

// Shared by every "route × car type" price sheet the traffic team keeps:
// supplier price lists (Supplier R-T), customer prices (Customer Price List)
// and driver tips (Driver Tips). One home, so the three can never drift.

/** Car-type columns of the traffic sheets, in sheet order → the system vehicle type each prices. */
export const PRICE_COLUMNS: readonly { header: string; vehicleType: string; note?: string }[] = [
  { header: 'Limo', vehicleType: 'Sedan' },
  { header: 'Hi Ace 7', vehicleType: 'Minivan 7' },
  { header: 'Hi Ace 15', vehicleType: 'Hi Ace' },
  { header: 'H-1', vehicleType: 'H-1', note: 'empty → Hi Ace 7' },
  { header: 'Coaster', vehicleType: 'Coaster' },
  { header: 'Bus', vehicleType: 'Bus' },
];

/**
 * A car type with no price of its own on a route is priced as another type. Only the Driver Tips
 * sheet has an H-1 column; customer prices, supplier lists and the own-car list price H-1 as Hi Ace 7.
 */
export const PRICE_FALLBACK_TYPE: Record<string, string> = { 'H-1': 'Minivan 7' };

/** vehicleTypeId → the vehicleTypeId it falls back to (PRICE_FALLBACK_TYPE, by name). */
export async function loadPriceFallback(prisma: any): Promise<Map<string, string>> {
  const types: { id: string; name: string }[] = await prisma.vehicleType.findMany({ select: { id: true, name: true } });
  const idOf = new Map(types.map((t) => [t.name, t.id]));
  const out = new Map<string, string>();
  for (const [from, to] of Object.entries(PRICE_FALLBACK_TYPE)) {
    if (idOf.has(from) && idOf.has(to)) out.set(idOf.get(from)!, idOf.get(to)!);
  }
  return out;
}

/** The car types to try for a price, in order: the type itself, then its fallback. */
export function priceTypes(vehicleTypeId: string | null, fallback: Map<string, string>): string[] {
  if (!vehicleTypeId) return [];
  const fb = fallback.get(vehicleTypeId);
  return fb ? [vehicleTypeId, fb] : [vehicleTypeId];
}

/** English half of a route name ("ARR-HRG | وصول داخلي" → "ARR-HRG") — the sheets' OPERATION. */
export function routeCode(name: string): string {
  return name.split(' | ')[0].trim();
}

/** Price cell → number, or null for empty / zero / text such as "-". */
export function parsePrice(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * OPERATION → route ids. Matches the English code (case/space-insensitive); a
 * code shared by the ذهاب / عوده pair returns both. Sheet spellings that differ
 * from the route code ("ARR-QUSEIR", "… 2 WAYS") are remembered as ImportNameAlias
 * rows of kind ROUTE whose targetId is the canonical route code.
 */
export async function loadRouteIndex(prisma: any): Promise<(operation: string) => string[]> {
  const [routes, aliases] = await Promise.all([
    prisma.jobServiceType.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.importNameAlias.findMany({ where: { kind: 'ROUTE' }, select: { normalizedName: true, targetId: true } }),
  ]);
  const byCode = new Map<string, string[]>();
  for (const r of routes) {
    const k = normalizeImportName(routeCode(r.name));
    byCode.set(k, [...(byCode.get(k) || []), r.id]);
  }
  const alias = new Map<string, string>(aliases.map((a: any) => [a.normalizedName, normalizeImportName(a.targetId)]));
  return (operation: string) => {
    const k = normalizeImportName(operation);
    return byCode.get(k) ?? byCode.get(alias.get(k) ?? '') ?? [];
  };
}

/**
 * First sheet whose header row contains every required header (normalised) and none of the
 * `forbid` headers. Sheets whose name matches `prefer` are tried first — the traffic workbook holds
 * several OPERATION sheets (customer prices, supplier lists, driver tips) side by side.
 */
export function findSheet(
  buffer: Buffer,
  required: string[],
  opts: { prefer?: RegExp; only?: RegExp; forbid?: string[] } = {},
): { grid: any[][]; headerIdx: number; header: string[] } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('Could not read the file');
  }
  const want = required.map((h) => normalizeImportName(h));
  const forbid = (opts.forbid || []).map((h) => normalizeImportName(h));
  let names = opts.prefer
    ? [...wb.SheetNames.filter((n) => opts.prefer!.test(n)), ...wb.SheetNames.filter((n) => !opts.prefer!.test(n))]
    : wb.SheetNames;
  // `only`: read just the sheet named for this table (the traffic workbook has several look-alikes).
  if (opts.only && wb.SheetNames.length > 1) {
    names = names.filter((n) => opts.only!.test(n));
    if (!names.length) throw new BadRequestException(`No sheet named like ${opts.only} in this workbook`);
  }
  for (const n of names) {
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const headerIdx = grid.findIndex((r) => {
      const cells = (r || []).map((c) => normalizeImportName(c));
      return want.every((w) => cells.includes(w)) && !forbid.some((f) => cells.includes(f));
    });
    if (headerIdx !== -1) return { grid, headerIdx, header: grid[headerIdx].map((c) => normalizeImportName(c)) };
  }
  throw new BadRequestException(`No sheet with ${required.join(' + ')} columns found`);
}

/** PRICE_COLUMNS present in a header row, with their column index and vehicle type id. */
export function priceColumnsIn(header: string[], vehicleTypes: { id: string; name: string }[]) {
  return PRICE_COLUMNS.map((c) => ({
    ...c,
    idx: header.indexOf(normalizeImportName(c.header)),
    vehicleTypeId: vehicleTypes.find((t) => t.name === c.vehicleType)?.id ?? null,
  })).filter((c) => c.idx !== -1 && c.vehicleTypeId) as { header: string; vehicleType: string; note?: string; idx: number; vehicleTypeId: string }[];
}

/** Workbook buffer with one sheet. */
export function sheetBuffer(rows: Record<string, unknown>[], header: string[], sheetName: string): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
