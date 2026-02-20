/** Colors converted from globals.css oklch values to hex for React Native */

export const lightColors = {
  background: '#FFFFFF',
  foreground: '#09090B',
  card: '#FFFFFF',
  cardForeground: '#09090B',
  popover: '#FFFFFF',
  popoverForeground: '#09090B',
  primary: '#18181B',
  primaryForeground: '#FAFAFA',
  secondary: '#F4F4F5',
  secondaryForeground: '#18181B',
  muted: '#F4F4F5',
  mutedForeground: '#71717A',
  accent: '#F4F4F5',
  accentForeground: '#18181B',
  destructive: '#EF4444',
  border: '#E4E4E7',
  input: '#E4E4E7',
  ring: '#A1A1AA',
};

export const darkColors = {
  background: '#09090B',
  foreground: '#FAFAFA',
  card: '#18181B',
  cardForeground: '#FAFAFA',
  popover: '#18181B',
  popoverForeground: '#FAFAFA',
  primary: '#E4E4E7',
  primaryForeground: '#18181B',
  secondary: '#27272A',
  secondaryForeground: '#FAFAFA',
  muted: '#27272A',
  mutedForeground: '#A1A1AA',
  accent: '#27272A',
  accentForeground: '#FAFAFA',
  destructive: '#DC2626',
  border: 'rgba(255, 255, 255, 0.1)',
  input: 'rgba(255, 255, 255, 0.15)',
  ring: '#71717A',
};

/** Status colors for job badges */
export const statusColors = {
  PENDING: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  ASSIGNED: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  IN_PROGRESS: { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  COMPLETED: { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  CANCELLED: { bg: '#F4F4F5', text: '#71717A', border: '#D4D4D8' },
  NO_SHOW: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
} as const;

/** Status colors for dark mode */
export const statusColorsDark = {
  PENDING: { bg: '#450A0A', text: '#FCA5A5', border: '#7F1D1D' },
  ASSIGNED: { bg: '#022C22', text: '#6EE7B7', border: '#064E3B' },
  IN_PROGRESS: { bg: '#172554', text: '#93C5FD', border: '#1E3A5F' },
  COMPLETED: { bg: '#052E16', text: '#86EFAC', border: '#14532D' },
  CANCELLED: { bg: '#27272A', text: '#A1A1AA', border: '#3F3F46' },
  NO_SHOW: { bg: '#431407', text: '#FDBA74', border: '#7C2D12' },
} as const;

/** Service type colors */
export const serviceTypeColors: Record<string, { bg: string; text: string }> = {
  ARR: { bg: '#DBEAFE', text: '#1D4ED8' },
  DEP: { bg: '#FEE2E2', text: '#DC2626' },
  EXCURSION: { bg: '#D1FAE5', text: '#059669' },
  ROUND_TRIP: { bg: '#EDE9FE', text: '#7C3AED' },
  ONE_WAY_GOING: { bg: '#FEF3C7', text: '#D97706' },
  ONE_WAY_RETURN: { bg: '#FFE4E6', text: '#E11D48' },
  OVER_DAY: { bg: '#CFFAFE', text: '#0891B2' },
  TRANSFER: { bg: '#E0E7FF', text: '#4338CA' },
  CITY_TOUR: { bg: '#FCE7F3', text: '#DB2777' },
  COLLECTING_ONE_WAY: { bg: '#FEF9C3', text: '#CA8A04' },
  COLLECTING_ROUND_TRIP: { bg: '#ECFCCB', text: '#65A30D' },
  EXPRESS_SHOPPING: { bg: '#F3E8FF', text: '#9333EA' },
};
