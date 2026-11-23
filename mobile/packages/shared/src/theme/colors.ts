/**
 * iTour GO mobile palette (2026-11-23 rebrand): ink #0E1A2B + iTour orange #FF7A1A, with
 * success / warning / info kept for state. The keys above `brand` mirror
 * the web app's shadcn tokens so every screen keeps compiling; the semantic
 * keys below them (success / warning / info + their soft tints) are what the
 * redesigned screens use for state.
 */

/**
 * Light theme — owner palette 2026-11-20 (same as the web light mode), 60 / 30 / 10:
 * #F7F2EA warm ivory (main) · #0E1A2B iTour ink (second: headers, buttons, tab accents) ·
 * #FF7A1A orange (loud: focus, highlights only). Text is black (#000000).
 */
export const lightColors = {
  background: '#F7F2EA',
  foreground: '#000000',
  card: '#FDFAF5',
  cardForeground: '#000000',
  popover: '#FDFAF5',
  popoverForeground: '#000000',
  primary: '#0E1A2B',
  primaryForeground: '#FFFFFF',
  secondary: '#EFE7DA',
  secondaryForeground: '#0E1A2B',
  muted: '#EFE7DA',
  mutedForeground: '#4A4F63',
  accent: '#F3E3D1',
  accentForeground: '#0E1A2B',
  destructive: '#E5484D',
  border: '#E3D8C6',
  input: '#DDD1BD',
  ring: '#FF7A1A',

  brand: '#0E1A2B',
  brandDeep: '#08111D',
  brandAccent: '#FF7A1A',
  brandGradientEnd: '#1B2A40',
  primarySoft: '#E5E8EC',
  success: '#16A34A',
  successSoft: '#E7F7EC',
  warning: '#D97706',
  warningSoft: '#FDF1E1',
  info: '#278ACC',
  infoSoft: '#E5F2FB',
  destructiveSoft: '#FDECEC',
  violet: '#7C3AED',
  violetSoft: '#F1EAFE',
  shadow: '#0E1A2B',
  tabBar: '#FDFAF5',
};

export const darkColors: typeof lightColors = {
  background: '#060B1A',
  foreground: '#EEF2FA',
  card: '#0E1730',
  cardForeground: '#EEF2FA',
  popover: '#0E1730',
  popoverForeground: '#EEF2FA',
  primary: '#FF7A1A',
  primaryForeground: '#0E1A2B',
  secondary: '#18243F',
  secondaryForeground: '#EEF2FA',
  muted: '#152039',
  mutedForeground: '#94A0BC',
  accent: '#132544',
  accentForeground: '#EEF2FA',
  destructive: '#F2555A',
  border: 'rgba(255, 255, 255, 0.08)',
  input: 'rgba(255, 255, 255, 0.14)',
  ring: '#FF7A1A',

  brand: '#0E1A2B',
  brandDeep: '#08111D',
  brandGradientEnd: '#1B2A40',
  brandAccent: '#FF7A1A',
  primarySoft: '#2B1D12',
  success: '#34D399',
  successSoft: '#0C2A20',
  warning: '#F5A524',
  warningSoft: '#2E1F08',
  info: '#4BA3E0',
  infoSoft: '#0D2338',
  destructiveSoft: '#341316',
  violet: '#A78BFA',
  violetSoft: '#221A3D',
  shadow: '#000000',
  tabBar: '#0B1429',
};

export type ThemeColors = typeof lightColors;

/** Status colors for job badges */
export const statusColors = {
  PENDING: { bg: '#FFF4E5', text: '#B45309', border: '#FCD9A8' },
  ASSIGNED: { bg: '#E6ECFA', text: '#0B2A7A', border: '#C3D0F0' },
  IN_PROGRESS: { bg: '#E5F2FB', text: '#1E6FA8', border: '#BBDCF2' },
  IN_PLACE: { bg: '#E5F2FB', text: '#1E6FA8', border: '#BBDCF2' },
  COMPLETED: { bg: '#E7F7EC', text: '#15803D', border: '#B7E4C4' },
  CANCELLED: { bg: '#F1F3F7', text: '#64708A', border: '#D9DEE8' },
  NO_SHOW: { bg: '#FDECEC', text: '#C53030', border: '#F7C3C3' },
} as const;

/** Status colors for dark mode */
export const statusColorsDark = {
  PENDING: { bg: '#2E1F08', text: '#FBBF5B', border: '#5A3D12' },
  ASSIGNED: { bg: '#14264A', text: '#9CC0FF', border: '#21407A' },
  IN_PROGRESS: { bg: '#0D2338', text: '#7CC4F2', border: '#1A4466' },
  IN_PLACE: { bg: '#0D2338', text: '#7CC4F2', border: '#1A4466' },
  COMPLETED: { bg: '#0C2A20', text: '#6EE7B7', border: '#14513A' },
  CANCELLED: { bg: '#18243F', text: '#94A0BC', border: '#2A3755' },
  NO_SHOW: { bg: '#341316', text: '#FCA5A5', border: '#6B1F24' },
} as const;

/** Service type colors */
export const serviceTypeColors: Record<string, { bg: string; text: string }> = {
  ARR: { bg: '#E5F2FB', text: '#1E6FA8' },
  DEP: { bg: '#FFF1E3', text: '#C2620A' },
  DAY_TOUR: { bg: '#E7F7EC', text: '#15803D' },
  ONE_WAY_TRANSFER: { bg: '#E6ECFA', text: '#0B2A7A' },
  RETURN: { bg: '#E3F6F3', text: '#0F766E' },
  TWO_WAY_TRANSFER: { bg: '#F1EAFE', text: '#6D28D9' },
  CITY_TO_CITY: { bg: '#EEF1F7', text: '#475569' },
};
