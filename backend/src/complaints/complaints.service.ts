import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';
import { UpdateComplaintDto } from './dto/update-complaint.dto.js';
import { TransitionComplaintDto } from './dto/transition-complaint.dto.js';
import { ComplaintQueryDto } from './dto/complaint-query.dto.js';
import { AgentAdjustmentsService } from './agent-adjustments.service.js';
import { ComplaintScoringService } from './complaint-scoring.service.js';
import { ComplaintSlaService } from './complaint-sla.service.js';
import { DEFAULT_SLA_HOURS, ASSIGNABLE_PARTIES } from './dto/complaint-constants.js';
import type {
  ComplaintStatus,
  ComplaintStage,
  ComplaintSource,
  ComplaintParty,
  ComplaintOutcome,
  Currency,
} from '../../generated/prisma/enums.js';

/**
 * Complaint lifecycle. Terminal states map to [] so they can never be reopened
 * by an API call — same shape as VALID_TRANSITIONS in traffic-jobs.service.ts.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['UNDER_REVIEW', 'REPLIED', 'CANCELLED'],
  UNDER_REVIEW: ['REPLIED', 'ESCALATED', 'CANCELLED'],
  REPLIED: ['ESCALATED', 'WON', 'PARTIALLY_LOST', 'LOST'],
  ESCALATED: ['WON', 'PARTIALLY_LOST', 'LOST', 'CANCELLED'],
  WON: [],
  PARTIALLY_LOST: [],
  LOST: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES = [
  'WON',
  'PARTIALLY_LOST',
  'LOST',
  'CANCELLED',
] as const;

/** Outcomes where we conceded money and the loss has to go somewhere. */
export const LOSS_STATUSES = ['LOST', 'PARTIALLY_LOST'] as const;

/** Fields hidden from users without complaints.financial.viewAmounts. */
const MONEY_FIELDS = [
  'claimedAmount',
  'lossAmount',
  'currency',
  'exchangeRate',
  'charge',
  'adjustments',
] as const;

export const VIEW_AMOUNTS_PERMISSION = 'complaints.financial.viewAmounts';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsGuard: PermissionsGuard,
    private readonly adjustmentsService: AgentAdjustmentsService,
    private readonly scoringService: ComplaintScoringService,
    private readonly slaService: ComplaintSlaService,
  ) {}

  private readonly complaintInclude = {
    category: true,
    // Every category the complaint carries, the primary one included.
    categoryLinks: { include: { category: true } },
    agent: { select: { id: true, legalName: true, tradeName: true } },
    trafficJob: {
      select: {
        id: true,
        internalRef: true,
        agentRef: true,
        jobDate: true,
        serviceType: true,
        // The guest, for a complaint that blames CLIENT.
        clientName: true,
        status: true,
        // OFFICE is not one person: it is whoever entered the job and whoever
        // dispatched the car. Both are named so the blame is traceable.
        createdBy: { select: { id: true, name: true } },
        assignment: {
          select: { assignedBy: { select: { id: true, name: true } } },
        },
      },
    },
    responsibleDriver: { select: { id: true, name: true } },
    responsibleRep: { select: { id: true, name: true } },
    responsibleSupplier: { select: { id: true, legalName: true, tradeName: true } },
    assignedTo: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
  };

  // ─────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────

  async findAll(query: ComplaintQueryDto, userId: string) {
    const { page = 1, limit = 20, sortBy = 'complaintDate', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: this.complaintInclude,
      }),
      this.prisma.complaint.count({ where }),
    ]);

    const canViewAmounts = await this.canViewAmounts(userId);
    const rows = data.map((c) => this.present(c, canViewAmounts));

    return new PaginatedResponse(rows, total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.complaintInclude,
        attachments: { orderBy: { createdAt: 'asc' } },
        charge: true,
        adjustments: true,
      },
    });

    if (!complaint) {
      throw new NotFoundException(`Complaint with ID "${id}" not found`);
    }

    return this.present(complaint, await this.canViewAmounts(userId));
  }

  /** Complaints attached to one job — powers the Complaints tab on the job screen. */
  async findByJob(trafficJobId: string, userId: string) {
    const rows = await this.prisma.complaint.findMany({
      where: { trafficJobId, deletedAt: null },
      orderBy: { complaintDate: 'desc' },
      include: this.complaintInclude,
    });

    const canViewAmounts = await this.canViewAmounts(userId);
    return rows.map((c) => this.present(c, canViewAmounts));
  }

  private buildWhere(query: ComplaintQueryDto): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null };

    if (query.status) where.status = query.status as ComplaintStatus;
    if (query.stage) where.stage = query.stage as ComplaintStage;
    if (query.source) where.source = query.source as ComplaintSource;
    // Match on the set, not the primary: a complaint whose second category or
    // second responsible party is the one being filtered for still counts.
    if (query.responsibleParty) {
      where.responsibleParties = { has: query.responsibleParty as ComplaintParty };
    }
    if (query.agentId) where.agentId = query.agentId;
    if (query.categoryId) {
      where.categoryLinks = { some: { categoryId: query.categoryId } };
    }
    if (query.trafficJobId) where.trafficJobId = query.trafficJobId;
    if (query.responsibleDriverId) where.responsibleDriverId = query.responsibleDriverId;
    if (query.responsibleRepId) where.responsibleRepId = query.responsibleRepId;
    if (query.responsibleSupplierId) {
      where.responsibleSupplierId = query.responsibleSupplierId;
    }
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    if (query.slaBreached) where.slaBreached = query.slaBreached === 'true';

    if (query.openOnly === 'true') {
      where.status = { notIn: [...TERMINAL_STATUSES] };
    } else if (query.openOnly === 'false') {
      where.status = { in: [...TERMINAL_STATUSES] };
    }

    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.gte = new Date(query.dateFrom);
      if (query.dateTo) range.lte = new Date(query.dateTo);
      where.complaintDate = range;
    }

    if (query.search) {
      where.OR = [
        { complaintNo: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { trafficJob: { internalRef: { contains: query.search, mode: 'insensitive' } } },
        { trafficJob: { agentRef: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  // ─────────────────────────────────────────────
  // WRITE
  // ─────────────────────────────────────────────

  async create(dto: CreateComplaintDto, userId: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
      select: { id: true, agentId: true, internalRef: true },
    });
    if (!job) {
      throw new NotFoundException(`Traffic job with ID "${dto.trafficJobId}" not found`);
    }

    const categoryIds = this.normaliseCategoryIds(dto.categoryIds, dto.categoryId);
    const primaryCategory = await this.loadCategories(categoryIds);

    // The category's default party only fills in when the caller said nothing
    // about responsibility at all. An explicit empty list means "no one" and
    // must survive — the form pre-fills the default on the way in, so anything
    // empty arriving here was deliberately cleared.
    const saidNothing =
      dto.responsibleParties === undefined && dto.responsibleParty === undefined;
    const parties = this.normaliseParties(
      dto.responsibleParties,
      dto.responsibleParty,
      saidNothing ? primaryCategory.defaultParty : null,
    );

    this.assertResponsibleConsistent(
      parties,
      dto.responsibleDriverId,
      dto.responsibleRepId,
      dto.responsibleSupplierId,
    );

    // DRIVER / REP / SUPPLIER name whoever the job is actually assigned to —
    // nobody has to pick them off a list, and the complaint can never blame a
    // driver who was never on the job.
    const responsible = await this.resolveResponsible(job.id, parties, dto);

    const agentId = await this.resolveAgentId(dto.agentId, job.agentId);

    const complaintDate = new Date(dto.complaintDate);
    const slaHours = dto.slaHours ?? DEFAULT_SLA_HOURS;
    const replyDueAt = this.computeReplyDueAt(complaintDate, slaHours);
    const repliedAt = dto.repliedAt ? new Date(dto.repliedAt) : null;
    const outcome = (dto.outcome ?? null) as ComplaintOutcome | null;
    const complaintNo = await this.generateComplaintNo();

    this.assertOutcomeConsistent(outcome, dto.lossAmount);

    const created = await this.prisma.complaint.create({
      data: {
        complaintNo,
        trafficJobId: job.id,
        // Snapshot the agent so reporting survives a later edit of the job.
        // An explicit agentId wins — a B2B job carries a customer, not an
        // agent, so without it a complaint on one could never reach an invoice.
        agentId,
        categoryId: categoryIds[0],
        // The whole set, primary included, so a filter finds it either way.
        categoryLinks: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        stage: dto.stage as ComplaintStage,
        source: (dto.source ?? 'AGENT') as ComplaintSource,
        subject: dto.subject,
        description: dto.description,
        complaintDate,
        slaHours,
        replyDueAt,
        repliedAt,
        // Only a reply logged after the deadline counts as breached here. An
        // unanswered backdated complaint is left to the hourly sweep, which is
        // what also notifies its owner — flagging it now would silence that.
        slaBreached: repliedAt ? this.isBreached(replyDueAt, repliedAt) : false,
        outcome,
        claimedAmount: dto.claimedAmount ?? null,
        // Nothing was conceded on a won complaint, whatever was typed.
        lossAmount: outcome === 'WON' ? null : (dto.lossAmount ?? null),
        currency: (dto.currency ?? 'EGP') as Currency,
        exchangeRate: dto.exchangeRate ?? 1,
        responsibleParties: parties,
        // The first entry stays the single-party answer everything downstream
        // still reads — scoring, the SLA notifications, charges and the exports.
        responsibleParty: parties[0],
        ...responsible,
        assignedToId: dto.assignedToId ?? null,
        createdById: userId,
      },
      include: this.complaintInclude,
    });

    return this.flattenCategories(created);
  }

  async update(id: string, dto: UpdateComplaintDto) {
    const existing = await this.getEditable(id);

    // Omitting both leaves the categories alone; sending either replaces the
    // whole set, so unticking one actually removes it.
    const categoryIds =
      dto.categoryIds === undefined && dto.categoryId === undefined
        ? null
        : this.normaliseCategoryIds(dto.categoryIds, dto.categoryId);
    if (categoryIds) await this.loadCategories(categoryIds);

    // Same for the parties — and the ids follow whatever the set now says.
    const parties =
      dto.responsibleParties === undefined && dto.responsibleParty === undefined
        ? null
        : this.normaliseParties(dto.responsibleParties, dto.responsibleParty, null);

    this.assertResponsibleConsistent(
      parties ?? this.storedParties(existing),
      dto.responsibleDriverId,
      dto.responsibleRepId,
      dto.responsibleSupplierId,
    );

    const responsible = parties
      ? await this.resolveResponsible(existing.trafficJobId, parties, dto)
      : {
          ...(dto.responsibleDriverId !== undefined && {
            responsibleDriverId: dto.responsibleDriverId,
          }),
          ...(dto.responsibleRepId !== undefined && {
            responsibleRepId: dto.responsibleRepId,
          }),
          ...(dto.responsibleSupplierId !== undefined && {
            responsibleSupplierId: dto.responsibleSupplierId,
          }),
        };

    const complaintDate = dto.complaintDate
      ? new Date(dto.complaintDate)
      : existing.complaintDate;
    const slaHours = dto.slaHours ?? existing.slaHours;
    const replyDueAt = this.computeReplyDueAt(complaintDate, slaHours);

    // Omitted leaves the stamp alone; an explicit null clears it and drops the
    // complaint back into the countdown.
    const repliedAt =
      dto.repliedAt === undefined
        ? existing.repliedAt
        : dto.repliedAt
          ? new Date(dto.repliedAt)
          : null;

    if (dto.outcome !== undefined) {
      this.assertOutcomeMatchesStatus(existing.status, dto.outcome);
      this.assertOutcomeConsistent(dto.outcome, dto.lossAmount);
    }

    // The category set is replaced wholesale, in the same transaction as the
    // row itself: clear the links, then write the new ones, or a category that
    // was unticked would survive as a stale link and keep matching filters.
    const updated = await this.prisma.$transaction(async (tx) => {
      if (categoryIds) {
        await tx.complaintCategoryLink.deleteMany({ where: { complaintId: id } });
        await tx.complaintCategoryLink.createMany({
          data: categoryIds.map((categoryId) => ({ complaintId: id, categoryId })),
        });
      }

      return tx.complaint.update({
        where: { id },
        data: {
          ...(categoryIds && { categoryId: categoryIds[0] }),
          ...(dto.agentId !== undefined && { agentId: dto.agentId }),
          ...(dto.stage !== undefined && { stage: dto.stage as ComplaintStage }),
          ...(dto.source !== undefined && { source: dto.source as ComplaintSource }),
          ...(dto.subject !== undefined && { subject: dto.subject }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.outcome !== undefined && {
            outcome: dto.outcome as ComplaintOutcome | null,
          }),
          ...(dto.claimedAmount !== undefined && { claimedAmount: dto.claimedAmount }),
          // Recording a win clears any provisional loss, the same way the WON
          // transition does — a won complaint must never carry one.
          ...(dto.outcome === 'WON'
            ? { lossAmount: null }
            : dto.lossAmount !== undefined && { lossAmount: dto.lossAmount }),
          ...(dto.currency !== undefined && { currency: dto.currency as Currency }),
          ...(dto.exchangeRate !== undefined && { exchangeRate: dto.exchangeRate }),
          ...(parties && {
            responsibleParties: parties,
            responsibleParty: parties[0],
          }),
          ...responsible,
          ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
          complaintDate,
          slaHours,
          replyDueAt,
          repliedAt,
          // Recompute against the possibly-moved deadline and reply date.
          slaBreached: this.isBreached(replyDueAt, repliedAt),
        },
        include: this.complaintInclude,
      });
    });

    return this.flattenCategories(updated);
  }

  async assign(id: string, assignedToId: string | null) {
    await this.getEditable(id);
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { assignedToId },
      include: this.complaintInclude,
    });
    return this.flattenCategories(updated);
  }

  async remove(id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, deletedAt: null },
      include: { charge: true },
    });
    if (!complaint) {
      throw new NotFoundException(`Complaint with ID "${id}" not found`);
    }
    if (complaint.charge && complaint.charge.status === 'POSTED') {
      throw new BadRequestException(
        'Cannot delete a complaint whose charge has been posted. Void the charge first.',
      );
    }

    return this.prisma.complaint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────

  /**
   * The single entry point for a status change. Validates the move, then stamps
   * the matching date in the same update so a status can never be recorded
   * without its timestamp.
   */
  async transition(id: string, dto: TransitionComplaintDto, userId: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, deletedAt: null },
    });
    if (!complaint) {
      throw new NotFoundException(`Complaint with ID "${id}" not found`);
    }

    const from = complaint.status;
    const to = dto.status;

    if (from === to) {
      throw new BadRequestException(`Complaint is already ${to}`);
    }

    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        allowed.length === 0
          ? `Complaint is ${from}, which is final and cannot be changed.`
          : `Cannot move a complaint from ${from} to ${to}. Allowed: ${allowed.join(', ')}.`,
      );
    }

    const claimedAmount = dto.claimedAmount ?? Number(complaint.claimedAmount ?? 0);
    const lossAmount = dto.lossAmount ?? Number(complaint.lossAmount ?? 0);

    this.assertOutcomeAmounts(to, claimedAmount, lossAmount);

    const now = new Date();
    const data: Record<string, unknown> = { status: to as ComplaintStatus };

    if (to === 'REPLIED') {
      data.repliedAt = now;
      data.slaBreached = this.isBreached(complaint.replyDueAt, now);
    }

    if ((TERMINAL_STATUSES as readonly string[]).includes(to)) {
      data.resolvedAt = now;
    }

    if ((LOSS_STATUSES as readonly string[]).includes(to)) {
      data.lossAmount = lossAmount;
      if (dto.claimedAmount !== undefined) data.claimedAmount = dto.claimedAmount;
      if (dto.currency !== undefined) data.currency = dto.currency as Currency;
      if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
    }

    if (to === 'WON') {
      // We conceded nothing — clear any provisional loss so reports stay honest.
      data.lossAmount = null;
    }

    // The outcome field mirrors whatever the settlement decided, so the form
    // and the status can never disagree about how the complaint went.
    if (to === 'WON') data.outcome = 'WON' as ComplaintOutcome;
    if ((LOSS_STATUSES as readonly string[]).includes(to)) {
      data.outcome = 'LOST' as ComplaintOutcome;
    }

    // The outcome and the money it owes the agent are recorded together:
    // a conceded loss must never end up without its pending adjustment.
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.complaint.update({
        where: { id },
        data,
        include: this.complaintInclude,
      });

      if ((LOSS_STATUSES as readonly string[]).includes(to)) {
        if (lossAmount > 0) {
          await this.adjustmentsService.createFromComplaint(
            tx,
            {
              id: row.id,
              complaintNo: row.complaintNo,
              agentId: row.agentId,
              subject: row.subject,
              currency: row.currency,
              exchangeRate: row.exchangeRate,
            },
            lossAmount,
            userId,
          );
        }

        // A lost complaint also costs the responsible rep or driver score
        // points — but never once their pay for the job has been posted. Both
        // are penalised when both are blamed.
        const penalty = await this.scoringService.applyPenalty(tx, {
          id: row.id,
          complaintNo: row.complaintNo,
          trafficJobId: row.trafficJobId,
          categoryIds: row.categoryLinks.map((l) => l.categoryId),
          responsibleParties: this.storedParties(row),
          responsibleRepId: row.responsibleRepId,
          responsibleDriverId: row.responsibleDriverId,
        });

        if (penalty.note) {
          await tx.complaint.update({
            where: { id: row.id },
            data: {
              scorePenaltyApplied: penalty.applied,
              scorePenaltyNote: penalty.note,
            },
          });
          row.scorePenaltyApplied = penalty.applied;
          row.scorePenaltyNote = penalty.note;
        }

        // Reps and drivers only ever hear about a complaint once it is settled
        // against us — never while it is still being argued.
        await this.slaService.notifyResponsibleParty(tx, {
          complaintNo: row.complaintNo,
          subject: row.subject,
          status: to,
          trafficJobId: row.trafficJobId,
          responsibleParties: this.storedParties(row),
          responsibleRepId: row.responsibleRepId,
          responsibleDriverId: row.responsibleDriverId,
        });
      }

      return row;
    });

    this.logger.log(
      `Complaint ${updated.complaintNo}: ${from} → ${to} by user ${userId}` +
        (dto.note ? ` (${dto.note})` : ''),
    );

    return this.flattenCategories(updated);
  }

  /** A won complaint cannot be saved with money conceded on it. */
  private assertOutcomeConsistent(outcome?: string | null, lossAmount?: number) {
    if (outcome === 'WON' && (lossAmount ?? 0) > 0) {
      throw new BadRequestException(
        'A won complaint cannot carry a loss amount. Record the outcome as lost instead.',
      );
    }
  }

  /**
   * A complaint already settled through a transition keeps the outcome that
   * settlement wrote. A plain edit must never contradict a terminal status, or
   * the charge and agent adjustment raised against it would no longer match.
   */
  private assertOutcomeMatchesStatus(status: string, outcome?: string | null) {
    if (!outcome) return;

    const settled =
      status === 'WON'
        ? 'WON'
        : (LOSS_STATUSES as readonly string[]).includes(status)
          ? 'LOST'
          : null;

    if (settled && settled !== outcome) {
      throw new BadRequestException(
        `This complaint was settled as ${status}; its outcome cannot be changed to ${outcome}.`,
      );
    }
  }

  /**
   * Amount rules per outcome. LOST means we paid; PARTIALLY_LOST means we paid
   * less than was claimed; WON means we paid nothing.
   */
  private assertOutcomeAmounts(to: string, claimedAmount: number, lossAmount: number) {
    if (to === 'LOST' && !(lossAmount > 0)) {
      throw new BadRequestException(
        'A lost complaint needs a loss amount greater than zero.',
      );
    }

    if (to === 'PARTIALLY_LOST') {
      if (!(claimedAmount > 0)) {
        throw new BadRequestException(
          'A partially lost complaint needs the amount the agent originally claimed.',
        );
      }
      if (!(lossAmount > 0)) {
        throw new BadRequestException(
          'A partially lost complaint needs a loss amount greater than zero.',
        );
      }
      if (lossAmount >= claimedAmount) {
        throw new BadRequestException(
          'A partially lost complaint must settle for less than the claimed amount. ' +
            'Use LOST when the full amount was conceded.',
        );
      }
    }

    if (to === 'WON' && lossAmount > 0) {
      throw new BadRequestException(
        'A won complaint cannot carry a loss amount. Clear it first, or record the outcome as partially lost.',
      );
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  /** Reply deadline. A plain instant + duration; timezone only matters for display. */
  private computeReplyDueAt(complaintDate: Date, slaHours: number): Date {
    return new Date(complaintDate.getTime() + slaHours * 60 * 60 * 1000);
  }

  /** Breached when we replied late, or have not replied and the deadline has passed. */
  private isBreached(replyDueAt: Date, repliedAt: Date | null, now = new Date()): boolean {
    return repliedAt ? repliedAt > replyDueAt : now > replyDueAt;
  }

  private async getEditable(id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, deletedAt: null },
    });
    if (!complaint) {
      throw new NotFoundException(`Complaint with ID "${id}" not found`);
    }
    return complaint;
  }

  /**
   * The categories a complaint carries. `categoryIds` is the whole set and its
   * first entry becomes the primary; a lone `categoryId` still works, for
   * callers that only ever name one.
   */
  private normaliseCategoryIds(ids?: string[], primary?: string): string[] {
    const ordered = [...(primary ? [primary] : []), ...(ids ?? [])].filter(Boolean);
    const unique = [...new Set(ordered)];
    if (unique.length === 0) {
      throw new BadRequestException('A complaint needs at least one category.');
    }
    return unique;
  }

  /** Every named category must exist. Returns the primary one. */
  private async loadCategories(categoryIds: string[]) {
    const categories = await this.prisma.complaintCategory.findMany({
      where: { id: { in: categoryIds }, deletedAt: null },
    });

    const missing = categoryIds.filter((id) => !categories.some((c) => c.id === id));
    if (missing.length > 0) {
      throw new NotFoundException(`Complaint category with ID "${missing[0]}" not found`);
    }

    return categories.find((c) => c.id === categoryIds[0])!;
  }

  /**
   * Who a complaint blames, as a set. NONE only survives on its own — it means
   * "no one", so it cannot sit beside a party that is actually at fault — and an
   * empty answer is stored as NONE rather than nothing, so filtering for "No
   * one" still finds it.
   */
  private normaliseParties(
    parties?: string[],
    primary?: string,
    fallback?: string | null,
  ): ComplaintParty[] {
    const ordered = [...(primary ? [primary] : []), ...(parties ?? [])].filter(Boolean);
    const source = ordered.length > 0 ? ordered : fallback ? [fallback] : [];
    const unique = [...new Set(source)].filter((p) => p !== 'NONE');
    return (unique.length > 0 ? unique : ['NONE']) as ComplaintParty[];
  }

  /** The set on a stored row, falling back to its primary for pre-migration rows. */
  private storedParties(row: {
    responsibleParties?: ComplaintParty[] | null;
    responsibleParty: ComplaintParty | null;
  }): ComplaintParty[] {
    if (row.responsibleParties && row.responsibleParties.length > 0) {
      return row.responsibleParties;
    }
    return row.responsibleParty ? [row.responsibleParty] : [];
  }

  /**
   * The driver, rep and supplier a complaint blames. Each is read off the job's
   * own assignment, so the complaint names whoever actually worked the job
   * rather than whoever was picked from a list; an explicit id still wins, for
   * the rare case of blaming someone the assignment no longer shows.
   *
   * Every party absent from the set has its id cleared — unticking REP must
   * leave no rep behind, or the charge panel would still offer them.
   */
  private async resolveResponsible(
    trafficJobId: string,
    parties: ComplaintParty[],
    explicit: {
      responsibleDriverId?: string;
      responsibleRepId?: string;
      responsibleSupplierId?: string;
    },
  ): Promise<{
    responsibleDriverId: string | null;
    responsibleRepId: string | null;
    responsibleSupplierId: string | null;
  }> {
    const needsAssignment = parties.some((p) =>
      (ASSIGNABLE_PARTIES as readonly string[]).includes(p),
    );

    const assignment = needsAssignment
      ? await this.prisma.trafficAssignment.findUnique({
          where: { trafficJobId },
          select: { driverId: true, repId: true, supplierId: true },
        })
      : null;

    return {
      responsibleDriverId: parties.includes('DRIVER')
        ? (explicit.responsibleDriverId ?? assignment?.driverId ?? null)
        : null,
      responsibleRepId: parties.includes('REP')
        ? (explicit.responsibleRepId ?? assignment?.repId ?? null)
        : null,
      responsibleSupplierId: parties.includes('SUPPLIER')
        ? (explicit.responsibleSupplierId ?? assignment?.supplierId ?? null)
        : null,
    };
  }

  /**
   * A complaint may now blame a driver, a rep and a supplier at once — one per
   * party — but an id still has to match a party that was actually named, or the
   * charge panel would offer to deduct from someone nobody blamed.
   */
  private assertResponsibleConsistent(
    parties: ComplaintParty[] | string[],
    driverId?: string | null,
    repId?: string | null,
    supplierId?: string | null,
  ) {
    const named = new Set(parties as string[]);

    if (driverId && !named.has('DRIVER')) {
      throw new BadRequestException(
        'A responsible driver cannot be set unless DRIVER is one of the responsible parties.',
      );
    }
    if (repId && !named.has('REP')) {
      throw new BadRequestException(
        'A responsible rep cannot be set unless REP is one of the responsible parties.',
      );
    }
    if (supplierId && !named.has('SUPPLIER')) {
      throw new BadRequestException(
        'A responsible supplier cannot be set unless SUPPLIER is one of the responsible parties.',
      );
    }
  }

  /**
   * The agent a complaint is with. An explicit choice wins over the job's own
   * agent; both are validated, because this is who a conceded amount is owed to.
   */
  private async resolveAgentId(
    explicit: string | undefined,
    jobAgentId: string | null,
  ): Promise<string | null> {
    if (!explicit) return jobAgentId;

    const agent = await this.prisma.agent.findFirst({
      where: { id: explicit, deletedAt: null },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException(`Agent with ID "${explicit}" not found`);
    }
    return agent.id;
  }

  private async generateComplaintNo(): Promise<string> {
    // Compare numerically: a text sort ranks "CMP-99999" above "CMP-100000",
    // which would wedge generation once the count crosses 100k.
    const rows = await this.prisma.$queryRawUnsafe<{ max_seq: number | null }[]>(
      `SELECT MAX(CAST(SUBSTRING(complaint_no FROM 5) AS INTEGER)) AS max_seq
         FROM complaints
        WHERE complaint_no ~ '^CMP-[0-9]+$'`,
    );
    const next = (rows[0]?.max_seq ?? 0) + 1;
    return `CMP-${String(next).padStart(5, '0')}`;
  }

  async canViewAmounts(userId: string): Promise<boolean> {
    const granted = await this.permissionsGuard.getUserPermissions(userId);
    return granted.has(VIEW_AMOUNTS_PERMISSION);
  }

  /**
   * What a complaint looks like on the wire: its categories flattened out of the
   * link rows, and the money stripped when the viewer may not see it.
   */
  private present<T extends Record<string, unknown>>(row: T, canView: boolean): T {
    return this.redactAmounts(this.flattenCategories(row), canView);
  }

  /**
   * `categoryLinks` is a join-table detail; every consumer wants the plain
   * `categories` array. Primary first — the links are all written in the same
   * instant, so their own order says nothing, and the form re-saves whatever it
   * reads first as the primary, which would otherwise drift on every edit.
   */
  private flattenCategories<T extends Record<string, unknown>>(row: T): T {
    const links = row.categoryLinks as
      | { categoryId: string; category?: Record<string, unknown> }[]
      | undefined;
    if (!links) return row;

    const primaryId = row.categoryId as string;
    const ordered = [
      ...links.filter((l) => l.categoryId === primaryId),
      ...links.filter((l) => l.categoryId !== primaryId),
    ];

    return {
      ...row,
      categories: ordered.map((l) => l.category).filter(Boolean),
      categoryIds: ordered.map((l) => l.categoryId),
    } as T;
  }

  /**
   * Strip the money off the payload for users without financial.viewAmounts.
   * Done server-side on purpose: hiding a column in the UI still ships the
   * number in the JSON response.
   */
  private redactAmounts<T extends Record<string, unknown>>(row: T, canView: boolean): T {
    if (canView) return row;
    const copy: Record<string, unknown> = { ...row };
    for (const field of MONEY_FIELDS) {
      if (field in copy) delete copy[field];
    }
    return copy as T;
  }
}
