/**
 * iTour mobile palette — built from the iTour brand mark (navy #001E72,
 * sky #278ACC, green #72BA5A, amber #E89638). The keys above `brand` mirror
 * the web app's shadcn tokens so every screen keeps compiling; the semantic
 * keys below them (success / warning / info + their soft tints) are what the
 * redesigned screens use for state.
 */

export const lightColors = {
  background: '#F3F5FA',
  foreground: '#0B1530',
  card: '#FFFFFF',
  cardForeground: '#0B1530',
  popover: '#FFFFFF',
  popoverForeground: '#0B1530',
  primary: '#0B2A7A',
  primaryForeground: '#FFFFFF',
  secondary: '#EAEFF8',
  secondaryForeground: '#0B2A7A',
  muted: '#EEF1F7',
  mutedForeground: '#64708A',
  accent: '#E8F1FB',
  accentForeground: '#0B2A7A',
  destructive: '#E5484D',
  border: '#E3E8F2',
  input: '#D6DDEA',
  ring: '#278ACC',

  brand: '#001E72',
  brandDeep: '#000F45',
  brandAccent: '#278ACC',
  primarySoft: '#E6ECFA',
  success: '#16A34A',
  successSoft: '#E7F7EC',
  warning: '#D97706',
  warningSoft: '#FDF1E1',
  info: '#278ACC',
  infoSoft: '#E5F2FB',
  destructiveSoft: '#FDECEC',
  violet: '#7C3AED',
  violetSoft: '#F1EAFE',
  shadow: '#0B1530',
  tabBar: '#FFFFFF',
};

export const darkColors: typeof lightColors = {
  background: '#060B1A',
  foreground: '#EEF2FA',
  card: '#0E1730',
  cardForeground: '#EEF2FA',
  popover: '#0E1730',
  popoverForeground: '#EEF2FA',
  primary: '#5B9BEA',
  primaryForeground: '#061233',
  secondary: '#18243F',
  secondaryForeground: '#EEF2FA',
  muted: '#152039',
  mutedForeground: '#94A0BC',
  accent: '#132544',
  accentForeground: '#EEF2FA',
  destructive: '#F2555A',
  border: 'rgba(255, 255, 255, 0.08)',
  input: 'rgba(255, 255, 255, 0.14)',
  ring: '#5B9BEA',

  brand: '#0A1F5C',
  brandDeep: '#030A24',
  brandAccent: '#4BA3E0',
  primarySoft: '#14264A',
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
