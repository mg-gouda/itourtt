// Literal unions used by the class-validator DTOs. The codebase validates enum
// fields with @IsIn(<local const>) rather than @IsEnum(<prisma enum>) — see
// extras/dto/upsert-extra.dto.ts — so the lists live here, next to the DTOs.

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

export const COMPLAINT_PARTIES = [
  'DRIVER',
  'REP',
  'SUPPLIER',
  'OFFICE',
  'AGENT',
  'CLIENT',
  'NONE',
] as const;

export const COMPLAINT_ATTACHMENT_KINDS = ['COMPLAINT_DOC', 'REPLY_DOC', 'EVIDENCE'] as const;

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR'] as const;

/** Default reply window. Stored per complaint so a later policy change can't rewrite history. */
export const DEFAULT_SLA_HOURS = 48;

/** Hours before the deadline at which the owner gets a "reply due soon" nudge. */
export const SLA_WARNING_HOURS = 12;
