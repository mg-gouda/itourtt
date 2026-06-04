/** Convert an arbitrary string to a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (combining diacritics)
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, 140);
}
