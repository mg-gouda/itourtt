import { useCallback } from 'react';
import { create } from 'zustand';
import { en, type TranslationKeys } from './en';
import { ar } from './ar';

export type Locale = 'en' | 'ar';

let currentLocale: Locale = 'en';

const translations: Record<Locale, TranslationKeys> = { en, ar };

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

const LOCALE_KEY = 'app_locale';

/**
 * The display language the user picked in Profile, persisted like the theme.
 * `t()` reads the module-level locale, so the app root keys its navigator on
 * `locale` to re-render every screen after a change.
 */
export const useLocaleStore = create<{
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  hydrate: () => Promise<void>;
}>((set) => ({
  locale: 'en',
  setLocale: async (locale) => {
    setLocale(locale);
    set({ locale });
    try {
      const EncryptedStorage = require('react-native-encrypted-storage').default;
      await EncryptedStorage.setItem(LOCALE_KEY, locale);
    } catch {}
  },
  hydrate: async () => {
    try {
      const EncryptedStorage = require('react-native-encrypted-storage').default;
      const stored = await EncryptedStorage.getItem(LOCALE_KEY);
      if (stored === 'en' || stored === 'ar') {
        setLocale(stored);
        set({ locale: stored });
      }
    } catch {}
  },
}));

export function getLocale(): Locale {
  return currentLocale;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

/** Translation function */
export function t(key: string): string {
  return getNestedValue(translations[currentLocale] as unknown as Record<string, unknown>, key);
}

/** Translate and fill `{name}` placeholders. */
export function tf(key: string, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** React hook that returns the translation function */
export function useT() {
  return useCallback((key: string) => t(key), []);
}

export { en, ar };
export type { TranslationKeys };
