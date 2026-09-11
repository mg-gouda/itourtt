// Literal unions used by the class-validator DTOs. The codebase validates enum
// fields with @IsIn(<local const>) rather than @IsEnum(<prisma enum>) — see
// extras/dto/upsert-extra.dto.ts — so the lists live here, next to the DTOs.

// BEFORE_JOB is still accepted and still renders on old rows; it is simply no
// longer offered in the form — see SELECTABLE_STAGES in frontend/src/lib/complaints.ts.
export const COMPLAINT_STAGES = ['BEFORE_JOB', 'DURING_JOB', 'AFTER_JOB'] as const;

export const COMPLAINT_SOURCES = ['AGENT', 'GUEST', 'DRIVER', 'REP', 'INTERNAL'] as const;

export const COMPLAINT_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'REPLIED',
  'ESCALATED',
  'WON',
  'PARTIALLY_LOST',
  'LOST',
  'CANCELLED',
] as const;

export const COMPLAINT_OUTCOMES = ['WON', 'LOST'] as const;

export const COMPLAINT_PARTIES = [
  'DRIVER',
  'REP',
  'SUPPLIER',
  'OFFICE',
  'AGENT',
  'CLIENT',
  'NONE',
] as const;

/** Parties whose responsible person is resolved from the job's assignment. */
export const ASSIGNABLE_PARTIES = ['DRIVER', 'REP', 'SUPPLIER'] as const;

export const COMPLAINT_ATTACHMENT_KINDS = ['COMPLAINT_DOC', 'REPLY_DOC', 'EVIDENCE'] as const;

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR'] as const;

/** Default reply window. Stored per complaint so a later policy change can't rewrite history. */
export const DEFAULT_SLA_HOURS = 24;

/** Hours before the deadline at which the owner gets a "reply due soon" nudge. */
export const SLA_WARNING_HOURS = 12;
