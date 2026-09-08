import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import {
  AgentAdjustmentQueryDto,
  AdjustmentDispositionDto,
  AttachAdjustmentDto,
} from './dto/agent-adjustment.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Currency } from '../../generated/prisma/enums.js';

/**
 * What a lost complaint owes the agent, and the three ways finance can settle it.
 *
 * A complaint that lands on LOST or PARTIALLY_LOST with a conceded amount
 * creates exactly one PENDING adjustment. From there it either rides along on
 * the agent's next invoice as a negative line, becomes a standalone credit note
 * (exported to Odoo as an `out_refund`), or is waived. Until someone chooses,
 * it stays PENDING and visible — money owed is never silently absorbed.
 */
@Injectable()
export class AgentAdjustmentsService {
  private readonly logger = new Logger(AgentAdjustmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly adjustmentInclude = {
    agent: { select: { id: true, legalName: true, tradeName: true } },
    complaint: {
      select: { id: true, complaintNo: true, subject: true, status: true },
    },
    invoiceLine: {
      select: { id: true, invoiceId: true, description: true, lineTotal: true },
    },
    creditNote: {
      select: { id: true, invoiceNumber: true, status: true, total: true },
    },
  };

  /**
   * Called from the complaint transition when an outcome concedes money.
   * Runs inside the caller's transaction so the outcome and the money owed
   * are recorded together or not at all.
   */
  async createFromComplaint(
    tx: Prisma.TransactionClient,
    complaint: {
      id: string;
      complaintNo: string;
      agentId: string | null;
      subject: string;
      currency: Currency;
      exchangeRate: Prisma.Decimal | number;
    },
    amount: number,
    userId: string,
  ) {
    if (!complaint.agentId) {
      this.logger.warn(
        `Complaint ${complaint.complaintNo} conceded ${amount} but has no agent — no adjustment created.`,
      );
      return null;
    }

    const existing = await tx.agentAdjustment.findFirst({
      where: { complaintId: complaint.id },
    });
    if (existing) {
      // The outcome was re-decided; keep one adjustment and re-state the amount.
      return tx.agentAdjustment.update({
        where: { id: existing.id },
        data: { amount, currency: complaint.currency },
      });
    }

    return tx.agentAdjustment.create({
      data: {
        adjustmentNo: await this.nextAdjustmentNo(tx),
        agentId: complaint.agentId,
        complaintId: complaint.id,
        description: `Complaint ${complaint.complaintNo} — ${complaint.subject}`,
        amount,
        currency: complaint.currency,
        exchangeRate: complaint.exchangeRate,
        createdById: userId,
      },
    });
  }

  async findAll(query: AgentAdjustmentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AgentAdjustmentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.agentId) where.agentId = query.agentId;
    if (query.complaintId) where.complaintId = query.complaintId;
    if (query.search) {
      where.OR = [
        { adjustmentNo: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.agentAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.adjustmentInclude,
      }),
      this.prisma.agentAdjustment.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  /** Pending adjustments for one agent — what the invoice builder offers alongside uninvoiced jobs. */
  async pendingForAgent(agentId: string) {
    return this.prisma.agentAdjustment.findMany({
      where: { agentId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: this.adjustmentInclude,
    });
  }

  async findOne(id: string) {
    const adjustment = await this.prisma.agentAdjustment.findUnique({
      where: { id },
      include: this.adjustmentInclude,
    });
    if (!adjustment) {
      throw new NotFoundException(`Adjustment with ID "${id}" not found`);
    }
    return adjustment;
  }

  /**
   * Disposition 1 — put it on a draft invoice as a negative line.
   *
   * Note `FinanceService.updateInvoiceLines` deletes and recreates every line
   * on the invoice; that releases attached adjustments back to PENDING rather
   * than leaving them pointing at a line that no longer exists.
   */
  async attachToInvoice(id: string, dto: AttachAdjustmentDto) {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(
        `Only a PENDING adjustment can go on an invoice; this one is ${adjustment.status}.`,
      );
    }

    const invoice = await this.prisma.agentInvoice.findUnique({
      where: { id: dto.invoiceId },
      include: { lines: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${dto.invoiceId}" not found`);
    }
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('An adjustment can only be added to a DRAFT invoice.');
    }
    if (invoice.agentId !== adjustment.agentId) {
      throw new BadRequestException(
        'That invoice belongs to a different agent than the adjustment.',
      );
    }
    if (invoice.currency !== adjustment.currency) {
      throw new BadRequestException(
        `The invoice is in ${invoice.currency} but the adjustment is in ${adjustment.currency}.`,
      );
    }

    const amount = Number(adjustment.amount);

    return this.prisma.$transaction(async (tx) => {
      // A deduction, so the unit price is negative and carries no tax of its own.
      const line = await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          description: adjustment.description,
          quantity: 1,
          unitPrice: -amount,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: -amount,
        },
      });

      await tx.agentInvoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: Number(invoice.subtotal) - amount,
          total: Number(invoice.total) - amount,
        },
      });

      return tx.agentAdjustment.update({
        where: { id },
        data: { status: 'ON_INVOICE', invoiceLineId: line.id },
        include: this.adjustmentInclude,
      });
    });
  }

  /**
   * Disposition 2 — a standalone credit note. It is an AgentInvoice of type
   * CREDIT_NOTE, which the Odoo export emits as `out_refund` so it imports
   * with no customization on the Odoo side.
   */
  async issueCreditNote(id: string, dto: AdjustmentDispositionDto, userId: string) {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(
        `Only a PENDING adjustment can become a credit note; this one is ${adjustment.status}.`,
      );
    }

    const amount = Number(adjustment.amount);
    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const creditNote = await tx.agentInvoice.create({
        data: {
          agentId: adjustment.agentId,
          invoiceNumber: await this.nextCreditNoteNo(tx),
          invoiceType: 'CREDIT_NOTE',
          invoiceDate,
          // A credit note is owed immediately; there is nothing to collect later.
          dueDate: invoiceDate,
          currency: adjustment.currency,
          subtotal: amount,
          taxAmount: 0,
          total: amount,
          exchangeRate: adjustment.exchangeRate,
          status: 'DRAFT',
          lines: {
            create: [
              {
                description: adjustment.description,
                quantity: 1,
                unitPrice: amount,
                taxRate: 0,
                taxAmount: 0,
                lineTotal: amount,
              },
            ],
          },
        },
        include: { lines: true },
      });

      this.logger.log(
        `Adjustment ${adjustment.adjustmentNo} issued as credit note ${creditNote.invoiceNumber} by user ${userId}`,
      );

      return tx.agentAdjustment.update({
        where: { id },
        data: { status: 'ISSUED_CREDIT_NOTE', creditNoteInvoiceId: creditNote.id },
        include: this.adjustmentInclude,
      });
    });
  }

  /** Disposition 3 — close it without any money moving. */
  async waive(id: string, dto: AdjustmentDispositionDto) {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(
        `Only a PENDING adjustment can be waived; this one is ${adjustment.status}.`,
      );
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Say why the adjustment is being waived.');
    }

    return this.prisma.agentAdjustment.update({
      where: { id },
      data: { status: 'WAIVED', waivedReason: dto.reason.trim() },
      include: this.adjustmentInclude,
    });
  }

  /**
   * Puts adjustments back in play when the invoice lines they were attached to
   * are wiped. Called by FinanceService inside its own transaction.
   */
  async releaseFromInvoice(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ): Promise<number> {
    const attached = await tx.agentAdjustment.findMany({
      where: { status: 'ON_INVOICE', invoiceLine: { invoiceId } },
      select: { id: true },
    });
    if (attached.length === 0) return 0;

    await tx.agentAdjustment.updateMany({
      where: { id: { in: attached.map((a) => a.id) } },
      data: { status: 'PENDING', invoiceLineId: null },
    });
    return attached.length;
  }

  private async nextAdjustmentNo(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.agentAdjustment.findFirst({
      orderBy: { adjustmentNo: 'desc' },
      select: { adjustmentNo: true },
    });
    const n = last ? parseInt(last.adjustmentNo.replace('ADJ-', ''), 10) + 1 : 1;
    return `ADJ-${String(n).padStart(5, '0')}`;
  }

  private async nextCreditNoteNo(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.agentInvoice.findFirst({
      where: { invoiceNumber: { startsWith: 'CN-' } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const n = last ? parseInt(last.invoiceNumber.replace('CN-', ''), 10) + 1 : 1;
    return `CN-${String(n).padStart(5, '0')}`;
  }
}
