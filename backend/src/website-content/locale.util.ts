import { Locale } from '../../generated/prisma/client.js';

/** Non-English locales that may have stored translations. */
export const SUPPORTED_LOCALES: Locale[] = [
  Locale.ar,
  Locale.de,
  Locale.fr,
  Locale.it,
  Locale.nl,
  Locale.ru,
];

/**
 * Normalise an incoming ?locale= value. Returns a supported non-English locale,
 * or null when the param is absent, "en", or anything unsupported — in which
 * case callers serve the English base content unchanged.
 */
export function parseLocale(raw?: string | null): Locale | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return (SUPPORTED_LOCALES as string[]).includes(lower)
    ? (lower as Locale)
    : null;
}

/**
 * Overlay defined translation fields over an English base object. Only keys
 * whose translated value is non-null/non-undefined replace the base; everything
 * else falls back to English. Returns a new object; never mutates inputs.
 */
export function overlayTranslation<T extends object>(
  base: T,
  translation: Record<string, unknown> | null | undefined,
  fields: (keyof T)[],
): T {
  if (!translation) return base;
  const merged = { ...base };
  for (const field of fields) {
    const value = translation[field as string];
    if (value !== null && value !== undefined) {
      merged[field] = value as T[keyof T];
    }
  }
  return merged;
}
