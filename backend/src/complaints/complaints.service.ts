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
import { DEFAULT_SLA_HOURS } from './dto/complaint-constants.js';
import type {
  ComplaintStatus,
  ComplaintStage,
  ComplaintSource,
  ComplaintParty,
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
    agent: { select: { id: true, legalName: true, tradeName: true } },
    trafficJob: {
      select: {
        id: true,
        internalRef: true,
        agentRef: true,
        jobDate: true,
        serviceType: true,
        clientName: true,
        status: true,
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
    const rows = data.map((c) => this.redactAmounts(c, canViewAmounts));

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

    return this.redactAmounts(complaint, await this.canViewAmounts(userId));
  }

  /** Complaints attached to one job — powers the Complaints tab on the job screen. */
  async findByJob(trafficJobId: string, userId: string) {
    const rows = await this.prisma.complaint.findMany({
      where: { trafficJobId, deletedAt: null },
      orderBy: { complaintDate: 'desc' },
      include: this.complaintInclude,
    });

    const canViewAmounts = await this.canViewAmounts(userId);
    return rows.map((c) => this.redactAmounts(c, canViewAmounts));
  }

  private buildWhere(query: ComplaintQueryDto): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null };

    if (query.status) where.status = query.status as ComplaintStatus;
    if (query.stage) where.stage = query.stage as ComplaintStage;
    if (query.source) where.source = query.source as ComplaintSource;
    if (query.responsibleParty) {
      where.responsibleParty = query.responsibleParty as ComplaintParty;
    }
    if (query.agentId) where.agentId = query.agentId;
    if (query.categoryId) where.categoryId = query.categoryId;
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

    const category = await this.prisma.complaintCategory.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException(`Complaint category with ID "${dto.categoryId}" not found`);
    }

    this.assertResponsibleConsistent(
      dto.responsibleParty,
      dto.responsibleDriverId,
      dto.responsibleRepId,
      dto.responsibleSupplierId,
    );

    const complaintDate = new Date(dto.complaintDate);
    const slaHours = dto.slaHours ?? DEFAULT_SLA_HOURS;
    const complaintNo = await this.generateComplaintNo();

    return this.prisma.complaint.create({
      data: {
        complaintNo,
        trafficJobId: job.id,
        // Snapshot the agent so reporting survives a later edit of the job.
        agentId: job.agentId,
        categoryId: dto.categoryId,
        stage: dto.stage as ComplaintStage,
        source: (dto.source ?? 'AGENT') as ComplaintSource,
        subject: dto.subject,
        description: dto.description,
        complaintDate,
        slaHours,
        replyDueAt: this.computeReplyDueAt(complaintDate, slaHours),
        claimedAmount: dto.claimedAmount ?? null,
        lossAmount: dto.lossAmount ?? null,
        currency: (dto.currency ?? 'EGP') as Currency,
        exchangeRate: dto.exchangeRate ?? 1,
        responsibleParty:
          (dto.responsibleParty as ComplaintParty) ??
          (category.defaultParty as ComplaintParty | null),
        responsibleDriverId: dto.responsibleDriverId ?? null,
        responsibleRepId: dto.responsibleRepId ?? null,
        responsibleSupplierId: dto.responsibleSupplierId ?? null,
        assignedToId: dto.assignedToId ?? null,
        createdById: userId,
      },
      include: this.complaintInclude,
    });
  }

  async update(id: string, dto: UpdateComplaintDto) {
    const existing = await this.getEditable(id);

    this.assertResponsibleConsistent(
      dto.responsibleParty ?? existing.responsibleParty ?? undefined,
      dto.responsibleDriverId,
      dto.responsibleRepId,
      dto.responsibleSupplierId,
    );

    const complaintDate = dto.complaintDate
      ? new Date(dto.complaintDate)
      : existing.complaintDate;
    const slaHours = dto.slaHours ?? existing.slaHours;
    const replyDueAt = this.computeReplyDueAt(complaintDate, slaHours);

    return this.prisma.complaint.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.stage !== undefined && { stage: dto.stage as ComplaintStage }),
        ...(dto.source !== undefined && { source: dto.source as ComplaintSource }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.claimedAmount !== undefined && { claimedAmount: dto.claimedAmount }),
        ...(dto.lossAmount !== undefined && { lossAmount: dto.lossAmount }),
        ...(dto.currency !== undefined && { currency: dto.currency as Currency }),
        ...(dto.exchangeRate !== undefined && { exchangeRate: dto.exchangeRate }),
        ...(dto.responsibleParty !== undefined && {
          responsibleParty: dto.responsibleParty as ComplaintParty,
        }),
        ...(dto.responsibleDriverId !== undefined && {
          responsibleDriverId: dto.responsibleDriverId,
        }),
        ...(dto.responsibleRepId !== undefined && {
          responsibleRepId: dto.responsibleRepId,
        }),
        ...(dto.responsibleSupplierId !== undefined && {
          responsibleSupplierId: dto.responsibleSupplierId,
        }),
        ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
        complaintDate,
        slaHours,
        replyDueAt,
        // Recompute against the possibly-moved deadline.
        slaBreached: this.isBreached(replyDueAt, existing.repliedAt),
      },
      include: this.complaintInclude,
    });
  }

  async assign(id: string, assignedToId: string | null) {
    await this.getEditable(id);
    return this.prisma.complaint.update({
      where: { id },
      data: { assignedToId },
      include: this.complaintInclude,
    });
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
        // points — but never once their pay for the job has been posted.
        const penalty = await this.scoringService.applyPenalty(tx, {
          id: row.id,
          complaintNo: row.complaintNo,
          trafficJobId: row.trafficJobId,
          categoryId: row.categoryId,
          responsibleParty: row.responsibleParty,
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
          responsibleParty: row.responsibleParty,
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

    return updated;
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
   * A complaint may name at most one responsible person, and the id must match
   * the declared party — the same exactly-one-FK trap the B2C convert fix hit.
   */
  private assertResponsibleConsistent(
    party?: string | null,
    driverId?: string | null,
    repId?: string | null,
    supplierId?: string | null,
  ) {
    const provided = [driverId, repId, supplierId].filter(Boolean);
    if (provided.length > 1) {
      throw new BadRequestException(
        'A complaint can name only one responsible driver, rep or supplier.',
      );
    }

    if (party === 'DRIVER' && repId) {
      throw new BadRequestException('Responsible party is DRIVER but a rep was supplied.');
    }
    if (party === 'REP' && driverId) {
      throw new BadRequestException('Responsible party is REP but a driver was supplied.');
    }
    if (party === 'SUPPLIER' && (driverId || repId)) {
      throw new BadRequestException(
        'Responsible party is SUPPLIER but a driver or rep was supplied.',
      );
    }
    if (driverId && party && party !== 'DRIVER') {
      throw new BadRequestException(
        `A responsible driver cannot be set when the responsible party is ${party}.`,
      );
    }
    if (repId && party && party !== 'REP') {
      throw new BadRequestException(
        `A responsible rep cannot be set when the responsible party is ${party}.`,
      );
    }
    if (supplierId && party && party !== 'SUPPLIER') {
      throw new BadRequestException(
        `A responsible supplier cannot be set when the responsible party is ${party}.`,
      );
    }
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
