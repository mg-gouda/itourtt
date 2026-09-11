// Shared types and display helpers for complaint tracking.
// Keep the status/stage/party lists in step with the Prisma enums and
// backend/src/complaints/dto/complaint-constants.ts.

export type ComplaintStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "REPLIED"
  | "ESCALATED"
  | "WON"
  | "PARTIALLY_LOST"
  | "LOST"
  | "CANCELLED";

export type ComplaintStage = "BEFORE_JOB" | "DURING_JOB" | "AFTER_JOB";

/** How the case went with the agent. Only a loss carries money. */
export type ComplaintOutcome = "WON" | "LOST";

export type ComplaintSource = "AGENT" | "GUEST" | "DRIVER" | "REP" | "INTERNAL";

export type ComplaintParty =
  | "DRIVER"
  | "REP"
  | "SUPPLIER"
  | "OFFICE"
  | "AGENT"
  | "CLIENT"
  | "NONE";

export const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR"] as const;

export interface ComplaintCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  defaultParty?: ComplaintParty | null;
  defaultPenaltyPoints: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Complaint {
  id: string;
  complaintNo: string;
  trafficJobId: string;
  agentId?: string | null;
  categoryId: string;
  stage: ComplaintStage;
  source: ComplaintSource;
  subject: string;
  description: string;
  status: ComplaintStatus;

  complaintDate: string;
  slaHours: number;
  replyDueAt: string;
  repliedAt?: string | null;
  slaBreached: boolean;
  resolvedAt?: string | null;
  outcome?: ComplaintOutcome | null;

  // Absent entirely (not null) when the viewer lacks
  // complaints.financial.viewAmounts — the backend strips them.
  claimedAmount?: number | string | null;
  lossAmount?: number | string | null;
  currency?: string;
  exchangeRate?: number | string;

  /** Everyone blamed. `responsibleParty` is its first entry. */
  responsibleParties?: ComplaintParty[];
  responsibleParty?: ComplaintParty | null;
  responsibleDriverId?: string | null;
  responsibleRepId?: string | null;
  responsibleSupplierId?: string | null;
  scorePenaltyApplied: number;
  scorePenaltyNote?: string | null;
  assignedToId?: string | null;

  /** The primary category, and every category the complaint carries. */
  category?: ComplaintCategory;
  categories?: ComplaintCategory[];
  categoryIds?: string[];
  agent?: { id: string; legalName: string; tradeName?: string | null } | null;
  trafficJob?: {
    id: string;
    internalRef: string;
    agentRef?: string | null;
    jobDate: string;
    serviceType: string;
    clientName?: string | null;
    status: string;
  } | null;
  responsibleDriver?: { id: string; name: string } | null;
  responsibleRep?: { id: string; name: string } | null;
  responsibleSupplier?: { id: string; legalName: string; tradeName?: string | null } | null;
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  attachments?: ComplaintAttachment[];
  // Stripped along with the amounts when the viewer lacks financial.viewAmounts.
  charge?: ComplaintCharge | null;
  adjustments?: AgentAdjustment[];
  createdAt: string;
}

export interface ComplaintAttachment {
  id: string;
  complaintId: string;
  kind: "COMPLAINT_DOC" | "REPLY_DOC" | "EVIDENCE";
  fileUrl: string;
  fileName: string;
  mimeType?: string | null;
  createdAt: string;
}

export type ComplaintChargeStatus = "PENDING" | "APPROVED" | "POSTED" | "VOID";

export interface ComplaintCharge {
  id: string;
  complaintId: string;
  party: ComplaintParty;
  driverId?: string | null;
  repId?: string | null;
  supplierId?: string | null;
  amount: number | string;
  currency: string;
  status: ComplaintChargeStatus;
  approvedAt?: string | null;
  postedAt?: string | null;
  postedFeeId?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  driver?: { id: string; name: string } | null;
  rep?: { id: string; name: string } | null;
  supplier?: { id: string; legalName: string; tradeName?: string | null } | null;
  approvedBy?: { id: string; name: string } | null;
}

export type AgentAdjustmentStatus =
  | "PENDING"
  | "ON_INVOICE"
  | "ISSUED_CREDIT_NOTE"
  | "WAIVED";

export interface AgentAdjustment {
  id: string;
  adjustmentNo: string;
  agentId: string;
  complaintId?: string | null;
  description: string;
  amount: number | string;
  currency: string;
  exchangeRate: number | string;
  status: AgentAdjustmentStatus;
  invoiceLineId?: string | null;
  creditNoteInvoiceId?: string | null;
  waivedReason?: string | null;
  createdAt: string;
  agent?: { id: string; legalName: string; tradeName?: string | null } | null;
  complaint?: {
    id: string;
    complaintNo: string;
    subject: string;
    status: ComplaintStatus;
  } | null;
  invoiceLine?: { id: string; invoiceId: string; description: string } | null;
  creditNote?: {
    id: string;
    invoiceNumber: string;
    status: string;
    total: number | string;
  } | null;
}

export const CHARGE_STATUS_META: Record<
  ComplaintChargeStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDING: { label: "Pending approval", variant: "secondary" },
  APPROVED: { label: "Approved", variant: "outline" },
  POSTED: { label: "Posted to fees", variant: "default" },
  VOID: { label: "Void", variant: "destructive" },
};

export const ADJUSTMENT_STATUS_META: Record<
  AgentAdjustmentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDING: { label: "Pending", variant: "secondary" },
  ON_INVOICE: { label: "On invoice", variant: "default" },
  ISSUED_CREDIT_NOTE: { label: "Credit note", variant: "default" },
  WAIVED: { label: "Waived", variant: "outline" },
};

/** Only these parties have a fee table a deduction can be posted into. */
export const CHARGEABLE_PARTIES: ComplaintParty[] = ["DRIVER", "REP", "SUPPLIER"];

export const COMPLAINT_STATUS_META: Record<
  ComplaintStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  OPEN: { label: "Open", variant: "secondary" },
  UNDER_REVIEW: { label: "Under Review", variant: "secondary" },
  REPLIED: { label: "Replied", variant: "outline" },
  ESCALATED: { label: "Escalated", variant: "destructive" },
  WON: { label: "Won", variant: "default" },
  PARTIALLY_LOST: { label: "Partially Lost", variant: "destructive" },
  LOST: { label: "Lost", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export const STAGE_LABELS: Record<ComplaintStage, string> = {
  BEFORE_JOB: "Before the job",
  DURING_JOB: "During the job",
  AFTER_JOB: "After the job",
};

/**
 * The stages a complaint can be logged at. BEFORE_JOB is deliberately absent —
 * it is no longer offered — but it stays in STAGE_LABELS so complaints already
 * logged against it still read properly, here and in the filters.
 */
export const SELECTABLE_STAGES: ComplaintStage[] = ["DURING_JOB", "AFTER_JOB"];

/**
 * Parties whose person comes from the job's assignment rather than a picker —
 * the complaint names whoever actually worked the job.
 */
export const ASSIGNABLE_PARTIES: ComplaintParty[] = ["DRIVER", "REP", "SUPPLIER"];

export const SOURCE_LABELS: Record<ComplaintSource, string> = {
  AGENT: "Agent",
  GUEST: "Guest",
  DRIVER: "Driver",
  REP: "Rep",
  INTERNAL: "Internal",
};

export const OUTCOME_LABELS: Record<ComplaintOutcome, string> = {
  WON: "Won",
  LOST: "Lost",
};

export const PARTY_LABELS: Record<ComplaintParty, string> = {
  DRIVER: "Driver",
  REP: "Rep",
  SUPPLIER: "Supplier",
  OFFICE: "Office",
  AGENT: "Agent",
  CLIENT: "Client",
  NONE: "No one",
};

export const TERMINAL_STATUSES: ComplaintStatus[] = [
  "WON",
  "PARTIALLY_LOST",
  "LOST",
  "CANCELLED",
];

/**
 * Which status a user may move to from here. Mirrors VALID_TRANSITIONS in
 * complaints.service.ts — the backend is still the authority; this only
 * decides which buttons to show.
 */
export const NEXT_STATUSES: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ["UNDER_REVIEW", "REPLIED", "CANCELLED"],
  UNDER_REVIEW: ["REPLIED", "ESCALATED", "CANCELLED"],
  REPLIED: ["ESCALATED", "WON", "PARTIALLY_LOST", "LOST"],
  ESCALATED: ["WON", "PARTIALLY_LOST", "LOST", "CANCELLED"],
  WON: [],
  PARTIALLY_LOST: [],
  LOST: [],
  CANCELLED: [],
};

/** The permission key each target status needs, matching the controller. */
export const TRANSITION_PERMISSION: Record<ComplaintStatus, string> = {
  UNDER_REVIEW: "complaints.transition.review",
  REPLIED: "complaints.transition.reply",
  ESCALATED: "complaints.transition.escalate",
  WON: "complaints.transition.resolve",
  PARTIALLY_LOST: "complaints.transition.resolve",
  LOST: "complaints.transition.resolve",
  CANCELLED: "complaints.transition.cancel",
  OPEN: "complaints.editButton",
};

/** Every category a complaint carries, primary first, for display. */
export function categoryNames(complaint: Complaint): string[] {
  if (complaint.categories?.length) {
    const others = complaint.categories
      .filter((c) => c.id !== complaint.categoryId)
      .map((c) => c.nameEn);
    const primary = complaint.categories.find((c) => c.id === complaint.categoryId);
    return [primary?.nameEn ?? complaint.category?.nameEn, ...others].filter(
      (n): n is string => Boolean(n),
    );
  }
  return complaint.category?.nameEn ? [complaint.category.nameEn] : [];
}

/** Every party a complaint blames. Falls back to the primary on older rows. */
export function responsibleParties(
  complaint: Pick<Complaint, "responsibleParties" | "responsibleParty">,
): ComplaintParty[] {
  if (complaint.responsibleParties?.length) return complaint.responsibleParties;
  return complaint.responsibleParty ? [complaint.responsibleParty] : [];
}

/** The named people a complaint blames — one per party at most. */
export function responsibleNames(complaint: Complaint): string[] {
  return [
    complaint.responsibleDriver?.name,
    complaint.responsibleRep?.name,
    complaint.responsibleSupplier?.tradeName || complaint.responsibleSupplier?.legalName,
  ].filter((n): n is string => Boolean(n));
}

export type SlaTone = "ok" | "warning" | "danger" | "neutral";

/**
 * Human-readable state of the reply window. Replied complaints report whether
 * the reply landed in time; unanswered ones count down to the deadline.
 */
export function formatSlaCountdown(
  complaint: Pick<Complaint, "replyDueAt" | "repliedAt" | "slaBreached" | "status">,
  now: Date = new Date(),
): { label: string; tone: SlaTone } {
  if (complaint.repliedAt) {
    return complaint.slaBreached
      ? { label: "Replied late", tone: "danger" }
      : { label: "Replied in time", tone: "ok" };
  }

  if (complaint.status === "CANCELLED") {
    return { label: "—", tone: "neutral" };
  }

  return describeReplyWindow(complaint.replyDueAt, null, now);
}

/**
 * Time left against a reply deadline, computed from the dates alone — the form
 * needs this before anything is saved, so it cannot read the stored
 * `slaBreached` flag the way {@link formatSlaCountdown} does.
 */
export function describeReplyWindow(
  replyDueAt: string | Date,
  repliedAt?: string | Date | null,
  now: Date = new Date(),
): { label: string; tone: SlaTone } {
  const due = new Date(replyDueAt).getTime();
  if (Number.isNaN(due)) return { label: "—", tone: "neutral" };

  if (repliedAt) {
    const margin = due - new Date(repliedAt).getTime();
    return margin >= 0
      ? { label: `Replied ${formatDuration(margin)} before the deadline`, tone: "ok" }
      : { label: `Replied ${formatDuration(-margin)} late`, tone: "danger" };
  }

  const diffMs = due - now.getTime();

  if (diffMs <= 0) {
    return { label: `Overdue by ${formatDuration(-diffMs)}`, tone: "danger" };
  }

  return {
    label: `${formatDuration(diffMs)} left`,
    tone: diffMs <= 12 * 3600 * 1000 ? "warning" : "ok",
  };
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string,
): string {
  if (amount === null || amount === undefined) return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency ?? ""}`.trim();
}
