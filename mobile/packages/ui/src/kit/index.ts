// The shared app design kit (rep + driver): gradient headers, surfaces, pills,
// buttons, week strip, form controls and the animated splash.
export * from './kit';
export { WeekStrip } from './WeekStrip';
export { Field, Choice, Counter, requiredHint } from './form';
export { Splash } from './Splash';

/** The iTour badge (logo mark on a white disc) used by splash and login screens. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const logoBadge = require('../../assets/logo-badge.png');
