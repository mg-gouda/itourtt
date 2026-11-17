import { lightColors, darkColors, statusColors, statusColorsDark, serviceTypeColors, type ThemeColors } from './colors';
import { spacing, borderRadius } from './spacing';
import { typography } from './typography';
import { useThemeStore } from './theme-store';

export type ThemeMode = 'light' | 'dark' | 'system';

export function getColors(): ThemeColors {
  const resolved = useThemeStore.getState().resolvedMode;
  return resolved === 'dark' ? darkColors : lightColors;
}

/** Reactive palette: re-renders the caller when the theme changes. */
export function useColors(): ThemeColors {
  const resolved = useThemeStore((s) => s.resolvedMode);
  return resolved === 'dark' ? darkColors : lightColors;
}

export function getStatusColors() {
  const resolved = useThemeStore.getState().resolvedMode;
  return resolved === 'dark' ? statusColorsDark : statusColors;
}

export function useTheme() {
  const mode = useThemeStore((s) => s.mode);
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  const setMode = useThemeStore((s) => s.setMode);
  return { mode, resolvedMode, setMode, isDark: resolvedMode === 'dark' };
}

export { useThemeStore };
export type { ThemeColors };
export { lightColors, darkColors, statusColors, statusColorsDark, serviceTypeColors };
export { spacing, borderRadius };
export { typography };
