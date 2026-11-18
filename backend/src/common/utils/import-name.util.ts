/**
 * Folds a name from an imported sheet so trivially different spellings meet:
 * case, every kind of whitespace (incl. NBSP), tatweel, and the Arabic letter
 * variants people type interchangeably (أ/إ/آ→ا, ى→ي, ة→ه). Used for matching
 * and as the key of remembered aliases (ImportNameAlias.normalizedName), so
 * changing it orphans saved aliases — extend, don't rewrite.
 */
export function normalizeImportName(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[\s ​-‏]+/g, '');
}

/** Digits only — sheet car numbers ("1389") vs plates ("ط ق ب - 1389"). */
export function plateDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}
