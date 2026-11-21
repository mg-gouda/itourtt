/**
 * Car Dispatch card colours. A car's colour is chosen on the vehicle page (vehicles.card_color);
 * without one it gets an automatic colour worked out from its id — fixed, never changes.
 */
export const CARD_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777",
  "#4f46e5", "#059669", "#b91c1c", "#7c3aed", "#c2410c", "#0e7490", "#65a30d", "#be185d",
];

export function autoCardColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_COLORS[h % CARD_COLORS.length];
}

export function cardColorOf(v: { id: string; cardColor?: string | null }): string {
  return v.cardColor || autoCardColor(v.id);
}
