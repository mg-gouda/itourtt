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
const RTL_RELOAD_KEY = 'app_rtl_reload';

function storage() {
  return require('react-native-encrypted-storage').default as {
    getItem: (k: string) => Promise<string | null>;
    setItem: (k: string, v: string) => Promise<void>;
  };
}

/**
 * Make the layout direction match the language: Arabic is right-to-left.
 * React Native only applies a direction change to a freshly built root view,
 * so when it has to change we ask the native AppRestart module to reload the
 * bundle. A reload marker stops a loop if the change somehow doesn't stick.
 * Also corrects phones whose system language is Arabic running the app in English.
 */
async function applyDirection(locale: Locale): Promise<void> {
  try {
    const { I18nManager, NativeModules } = require('react-native');
    const wantRtl = locale === 'ar';
    I18nManager.allowRTL(wantRtl);
    I18nManager.swapLeftAndRightInRTL(true);
    if (I18nManager.isRTL === wantRtl) {
      await storage().setItem(RTL_RELOAD_KEY, '');
      return;
    }
    I18nManager.forceRTL(wantRtl);
    const tried = await storage().getItem(RTL_RELOAD_KEY);
    if (tried === locale) return; // already reloaded once for this language
    await storage().setItem(RTL_RELOAD_KEY, locale);
    NativeModules.AppRestart?.restart?.();
  } catch {}
}

/** True when the current layout runs right-to-left (Arabic). */
export function isRTL(): boolean {
  try {
    return !!require('react-native').I18nManager.isRTL;
  } catch {
    return false;
  }
}

/**
 * The display language the user picked in Profile, persisted like the theme.
 * `t()` reads the module-level locale, so the app root keys its navigator on
 * `locale` to re-render every screen after a change; a direction change
 * (English <-> Arabic) reloads the app so the layout mirrors.
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
      await storage().setItem(LOCALE_KEY, locale);
    } catch {}
    await applyDirection(locale);
  },
  hydrate: async () => {
    let locale: Locale = 'en';
    try {
      const stored = await storage().getItem(LOCALE_KEY);
      if (stored === 'en' || stored === 'ar') locale = stored;
    } catch {}
    setLocale(locale);
    set({ locale });
    await applyDirection(locale);
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
