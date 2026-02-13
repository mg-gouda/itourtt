import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDriverFeeDto } from './dto/create-driver-fee.dto.js';
import { CreateRepFeeDto } from './dto/create-rep-fee.dto.js';
import { CreateSupplierCostDto } from './dto/create-supplier-cost.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { GenerateCustomerInvoicesDto } from './dto/create-customer-invoice.dto.js';
import { UpdateInvoiceLinesDto } from './dto/update-invoice-lines.dto.js';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import { Currency, PaymentMethod, InvoiceStatus } from '../../generated/prisma/client.js';
import type { InvoiceType } from '../../generated/prisma/client.js';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // DRIVER TRIP FEES
  // ─────────────────────────────────────────────

  async createDriverFee(dto: CreateDriverFeeDto, userId: string) {
    // Verify traffic job exists
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(
        `Traffic job with ID "${dto.trafficJobId}" not found`,
      );
    }

    // Verify driver exists
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, deletedAt: null },
    });
    if (!driver) {
      throw new NotFoundException(
        `Driver with ID "${dto.driverId}" not found`,
      );
    }

    // Require from/to zones on the job for driver fee routing
    if (!job.fromZoneId || !job.toZoneId) {
      throw new BadRequestException(
        'Traffic job must have fromZone and toZone to create a driver fee',
      );
    }

    const currency = (dto.currency as Currency) || Currency.EGP;

    return this.prisma.driverTripFee.create({
      data: {
        driverId: dto.driverId,
        trafficJobId: dto.trafficJobId,
        fromZoneId: job.fromZoneId,
        toZoneId: job.toZoneId,
        amount: dto.amount,
        currency,
      },
      include: {
        driver: true,
        trafficJob: true,
        fromZone: true,
        toZone: true,
      },
    });
  }

  // ─────────────────────────────────────────────
  // REP FEES
  // ─────────────────────────────────────────────

  async createRepFee(dto: CreateRepFeeDto, userId: string) {
    // Verify traffic job exists and is an ARR job
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(
        `Traffic job with ID "${dto.trafficJobId}" not found`,
      );
    }

    if (job.serviceType !== 'ARR') {
      throw new BadRequestException(
        'Rep fees can only be created for arrival (ARR) jobs',
      );
    }

    // Verify rep exists
    const rep = await this.prisma.rep.findFirst({
      where: { id: dto.repId, deletedAt: null },
    });
    if (!rep) {
      throw new NotFoundException(`Rep with ID "${dto.repId}" not found`);
    }

    // Use provided amount or fall back to rep's feePerFlight
    const amount = dto.amount ?? Number(rep.feePerFlight);
    if (amount <= 0) {
      throw new BadRequestException(
        'Rep fee amount must be positive. Either provide an amount or set feePerFlight on the rep.',
      );
    }

    const currency = (dto.currency as Currency) || Currency.EGP;

    return this.prisma.repFee.create({
      data: {
        repId: dto.repId,
        trafficJobId: dto.trafficJobId,
        amount,
        currency,
      },
      include: {
        rep: true,
        trafficJob: true,
      },
    });
  }

  async getRepDailyFees(repId: string, date: string) {
    // Verify rep exists
    const rep = await this.prisma.rep.findFirst({
      where: { id: repId, deletedAt: null },
    });
    if (!rep) {
      throw new NotFoundException(`Rep with ID "${repId}" not found`);
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const fees = await this.prisma.repFee.findMany({
      where: {
        repId,
        trafficJob: {
          jobDate: { gte: dayStart, lte: dayEnd },
        },
      },
      include: {
        trafficJob: {
          include: {
            fromZone: true,
            toZone: true,
            flight: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const flightCount = fees.length;
    const totalAmount = fees.reduce((sum, f) => sum + Number(f.amount), 0);

    return {
      repId,
      repName: rep.name,
      date,
      feePerFlight: Number(rep.feePerFlight),
      flightCount,
      totalAmount,
      fees,
    };
  }

  // ─────────────────────────────────────────────
  // SUPPLIER COSTS
  // ─────────────────────────────────────────────

  async createSupplierCost(dto: CreateSupplierCostDto, userId: string) {
    // Verify traffic job exists
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(
        `Traffic job with ID "${dto.trafficJobId}" not found`,
      );
    }

    // Verify supplier exists
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException(
        `Supplier with ID "${dto.supplierId}" not found`,
      );
    }

    const currency = (dto.currency as Currency) || Currency.EGP;

    return this.prisma.supplierCost.create({
      data: {
        supplierId: dto.supplierId,
        trafficJobId: dto.trafficJobId,
        amount: dto.amount,
        currency,
      },
      include: {
        supplier: true,
        trafficJob: true,
      },
    });
  }

  // ─────────────────────────────────────────────
  // CREDIT LIMIT CHECK
  // ─────────────────────────────────────────────

  private async checkAgentCreditLimit(
    agentId: string,
    newInvoiceTotal: number,
  ): Promise<void> {
    const creditTerms = await this.prisma.agentCreditTerms.findUnique({
      where: { agentId },
    });

    if (!creditTerms) return;

    const creditLimit = Number(creditTerms.creditLimit);
    if (creditLimit <= 0) return;

    const outstandingResult = await this.prisma.agentInvoice.aggregate({
      where: {
        agentId,
        status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.POSTED] },
      },
      _sum: { total: true },
    });

    const outstandingBalance = Number(outstandingResult._sum.total || 0);
    const availableCredit = creditLimit - outstandingBalance;

    if (newInvoiceTotal > availableCredit) {
      throw new BadRequestException(
        `Agent credit limit exceeded. Limit: ${creditLimit}, Outstanding: ${outstandingBalance}, Available: ${availableCredit.toFixed(2)}, Requested: ${newInvoiceTotal}`,
      );
    }
  }

  // ─────────────────────────────────────────────
  // TAX CALCULATION HELPERS
  // ─────────────────────────────────────────────

  private calculateLineTax(
    unitPrice: number,
    quantity: number,
    taxRate: number,
  ): { taxAmount: number; lineTotal: number } {
    const netAmount = unitPrice * quantity;
    const taxAmount =
      taxRate > 0
        ? parseFloat((netAmount * taxRate / 100).toFixed(2))
        : 0;
    const lineTotal = parseFloat((netAmount + taxAmount).toFixed(2));
    return { taxAmount, lineTotal };
  }

  private calculateInvoiceTotals(
    lines: Array<{ unitPrice: number; quantity: number; taxRate: number }>,
  ): { subtotal: number; taxAmount: number; total: number } {
    let subtotal = 0;
    let taxAmount = 0;
    for (const line of lines) {
      const net = line.unitPrice * line.quantity;
      subtotal += net;
      if (line.taxRate > 0) {
        taxAmount += parseFloat((net * line.taxRate / 100).toFixed(2));
      }
    }
    subtotal = parseFloat(subtotal.toFixed(2));
    taxAmount = parseFloat(taxAmount.toFixed(2));
    const total = parseFloat((subtotal + taxAmount).toFixed(2));
    return { subtotal, taxAmount, total };
  }

  // ─────────────────────────────────────────────
  // INVOICES
  // ─────────────────────────────────────────────

  private generateInvoiceNumber(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `INV-${yy}${mm}${dd}-${seq}`;
  }

  async createInvoice(dto: CreateInvoiceDto, userId: string) {
    // Verify agent exists
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.agentId, deletedAt: null },
    });
    if (!agent) {
      throw new NotFoundException(
        `Agent with ID "${dto.agentId}" not found`,
      );
    }

    // Verify all traffic jobs in lines exist (only for lines that have trafficJobId)
    const jobIds = dto.lines
      .map((line) => line.trafficJobId)
      .filter((id): id is string => !!id);
    if (jobIds.length > 0) {
      const jobs = await this.prisma.trafficJob.findMany({
        where: { id: { in: jobIds }, deletedAt: null },
      });
      if (jobs.length !== jobIds.length) {
        const foundIds = new Set(jobs.map((j) => j.id));
        const missingIds = jobIds.filter((id) => !foundIds.has(id));
        throw new NotFoundException(
          `Traffic jobs not found: ${missingIds.join(', ')}`,
        );
      }
    }

    // Normalize lines with tax calculation, then check credit limit
    const normalizedLines = dto.lines.map((line) => {
      const unitPrice = line.unitPrice ?? line.amount ?? 0;
      const quantity = line.quantity ?? 1;
      const taxRate = line.taxRate ?? 0;
      const { taxAmount, lineTotal } = this.calculateLineTax(unitPrice, quantity, taxRate);
      return {
        trafficJobId: line.trafficJobId,
        description: line.description,
        unitPrice,
        quantity,
        taxRate,
        taxAmount,
        lineTotal,
      };
    });

    const totals = this.calculateInvoiceTotals(
      normalizedLines.map((l) => ({
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        taxRate: l.taxRate,
      })),
    );

    // Check credit limit before creating the invoice
    await this.checkAgentCreditLimit(dto.agentId, totals.total);

    const currency = (dto.currency as Currency) || Currency.EGP;

    // Generate unique invoice number with retry logic
    let invoiceNo: string = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      invoiceNo = this.generateInvoiceNumber();
      const existing = await this.prisma.agentInvoice.findUnique({
        where: { invoiceNumber: invoiceNo },
      });
      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new BadRequestException(
        'Failed to generate unique invoice number. Please try again.',
      );
    }

    // Create invoice with lines in a transaction
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.agentInvoice.create({
        data: {
          agentId: dto.agentId,
          invoiceNumber: invoiceNo,
          invoiceDate: new Date(dto.issueDate),
          dueDate: new Date(dto.dueDate),
          currency,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          exchangeRate: 1,
          status: InvoiceStatus.DRAFT,
          lines: {
            create: normalizedLines.map((line) => ({
              trafficJobId: line.trafficJobId || undefined,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: {
          agent: true,
          lines: {
            include: {
              trafficJob: true,
            },
          },
        },
      });

      return invoice;
    });
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.agentInvoice.findUnique({
      where: { id },
      include: {
        agent: true,
        customer: true,
        lines: {
          include: {
            trafficJob: true,
          },
        },
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    const paidAmount = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    return {
      ...invoice,
      paidAmount,
      remainingBalance: Number(invoice.total) - paidAmount,
    };
  }

  async updateInvoiceLines(id: string, dto: UpdateInvoiceLinesDto) {
    const invoice = await this.prisma.agentInvoice.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Can only edit lines on DRAFT invoices');
    }

    const calculatedLines = dto.lines.map((line) => {
      const { taxAmount, lineTotal } = this.calculateLineTax(
        line.unitPrice,
        line.quantity,
        line.taxRate,
      );
      return { ...line, taxAmount, lineTotal };
    });

    const totals = this.calculateInvoiceTotals(
      dto.lines.map((l) => ({
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        taxRate: l.taxRate,
      })),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });

      for (const line of calculatedLines) {
        await tx.invoiceLine.create({
          data: {
            invoiceId: id,
            trafficJobId: line.trafficJobId || null,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
          },
        });
      }

      return tx.agentInvoice.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
        },
        include: {
          agent: true,
          customer: true,
          lines: { include: { trafficJob: true } },
          payments: true,
        },
      });
    });
  }

  async updateInvoiceStatus(id: string, dto: UpdateInvoiceStatusDto) {
    const invoice = await this.prisma.agentInvoice.findUnique({
      where: { id },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    if (dto.status === 'POSTED') {
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Can only post DRAFT invoices');
      }
      return this.prisma.agentInvoice.update({
        where: { id },
        data: { status: InvoiceStatus.POSTED, postedAt: new Date() },
        include: {
          agent: true,
          customer: true,
          lines: { include: { trafficJob: true } },
          payments: true,
        },
      });
    }

    if (dto.status === 'CANCELLED') {
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Can only cancel DRAFT invoices');
      }
      return this.prisma.agentInvoice.update({
        where: { id },
        data: { status: InvoiceStatus.CANCELLED },
        include: {
          agent: true,
          customer: true,
          lines: { include: { trafficJob: true } },
          payments: true,
        },
      });
    }

    throw new BadRequestException(`Invalid target status: ${dto.status}`);
  }

  async listInvoices(
    pagination: PaginationDto,
    agentId?: string,
    status?: string,
  ) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (agentId) {
      where.agentId = agentId;
    }
    if (status) {
      where.status = status as InvoiceStatus;
    }

    const [rawData, total] = await Promise.all([
      this.prisma.agentInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: true,
          customer: true,
          payments: { select: { amount: true } },
          _count: {
            select: { lines: true, payments: true },
          },
        },
      }),
      this.prisma.agentInvoice.count({ where }),
    ]);

    const data = rawData.map((inv) => {
      const paidAmount = inv.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      const { payments: _payments, ...rest } = inv;
      return {
        ...rest,
        paidAmount,
        remainingBalance: Number(inv.total) - paidAmount,
      };
    });

    return new PaginatedResponse(data, total, page, limit);
  }

  // ─────────────────────────────────────────────
  // PAYMENTS
  // ─────────────────────────────────────────────

  async createPayment(dto: CreatePaymentDto, userId: string) {
    // Verify invoice exists
    const invoice = await this.prisma.agentInvoice.findUnique({
      where: { id: dto.agentInvoiceId },
      include: { payments: true },
    });

    if (!invoice) {
      throw new NotFoundException(
        `Invoice with ID "${dto.agentInvoiceId}" not found`,
      );
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot add payment to a cancelled invoice');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already fully paid');
    }

    // Calculate existing payments total
    const existingPaymentsTotal = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    const newTotal = existingPaymentsTotal + dto.amount;
    const invoiceTotal = Number(invoice.total);

    if (newTotal > invoiceTotal) {
      throw new BadRequestException(
        `Payment amount ${dto.amount} exceeds remaining balance of ${invoiceTotal - existingPaymentsTotal}`,
      );
    }

    // Determine new invoice status
    const newStatus =
      newTotal >= invoiceTotal
        ? InvoiceStatus.PAID
        : InvoiceStatus.POSTED; // POSTED acts as PARTIALLY_PAID

    const paymentMethod = dto.method as PaymentMethod;

    // Create payment and update invoice status in a transaction
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          agentInvoiceId: dto.agentInvoiceId,
          amount: dto.amount,
          paymentMethod,
          paymentDate: new Date(dto.paymentDate),
          reference: dto.reference,
        },
        include: {
          agentInvoice: true,
        },
      });

      await tx.agentInvoice.update({
        where: { id: dto.agentInvoiceId },
        data: { status: newStatus },
      });

      return payment;
    });
  }

  // ─────────────────────────────────────────────
  // JOB FINANCIALS
  // ─────────────────────────────────────────────

  async getJobFinancials(jobId: string) {
    // Verify job exists
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
    });

    if (!job) {
      throw new NotFoundException(
        `Traffic job with ID "${jobId}" not found`,
      );
    }

    const [driverFees, repFees, supplierCosts, invoiceLines] =
      await Promise.all([
        this.prisma.driverTripFee.findMany({
          where: { trafficJobId: jobId },
          include: {
            driver: true,
            fromZone: true,
            toZone: true,
          },
        }),
        this.prisma.repFee.findMany({
          where: { trafficJobId: jobId },
          include: {
            rep: true,
          },
        }),
        this.prisma.supplierCost.findMany({
          where: { trafficJobId: jobId },
          include: {
            supplier: true,
          },
        }),
        this.prisma.invoiceLine.findMany({
          where: { trafficJobId: jobId },
          include: {
            invoice: true,
          },
        }),
      ]);

    return {
      jobId,
      driverFees,
      repFees,
      supplierCosts,
      invoiceLines,
    };
  }

  // ─────────────────────────────────────────────
  // CUSTOMER INVOICES
  // ─────────────────────────────────────────────

  private generateCustomerInvoiceNumber(type: 'TRANSFER' | 'DRIVER_TIP'): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const prefix = type === 'TRANSFER' ? 'CIT' : 'CID';
    return `${prefix}-${yy}${mm}${dd}-${seq}`;
  }

  async generateCustomerInvoices(dto: GenerateCustomerInvoicesDto, userId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID "${dto.customerId}" not found`);
    }

    const jobs = await this.prisma.trafficJob.findMany({
      where: { id: { in: dto.trafficJobIds }, deletedAt: null },
      include: {
        fromZone: true,
        toZone: true,
        assignment: { include: { vehicle: { include: { vehicleType: true } } } },
      },
    });

    if (jobs.length === 0) {
      throw new NotFoundException('No valid traffic jobs found');
    }

    const priceItems = await this.prisma.customerPriceItem.findMany({
      where: { customerId: dto.customerId },
    });

    const priceMap = new Map<string, { transferPrice: number; driverTip: number }>();
    for (const item of priceItems) {
      const key = `${item.serviceType}-${item.fromZoneId}-${item.toZoneId}-${item.vehicleTypeId}`;
      priceMap.set(key, { transferPrice: Number(item.transferPrice), driverTip: Number(item.driverTip) });
    }

    const transferLines: Array<{ trafficJobId: string; description: string; amount: number }> = [];
    const driverTipLines: Array<{ trafficJobId: string; description: string; amount: number }> = [];

    for (const job of jobs) {
      if (!job.fromZoneId || !job.toZoneId) continue;
      const vehicleTypeId = job.assignment?.vehicle?.vehicleTypeId;
      if (!vehicleTypeId) continue;

      const prices = priceMap.get(`${job.serviceType}-${job.fromZoneId}-${job.toZoneId}-${vehicleTypeId}`);
      if (!prices) continue;

      const routeDescription = `${job.fromZone?.name || 'Unknown'} → ${job.toZone?.name || 'Unknown'}`;
      const vehicleName = job.assignment?.vehicle?.vehicleType?.name || 'Vehicle';

      if (prices.transferPrice > 0) {
        transferLines.push({
          trafficJobId: job.id,
          description: `Transfer: ${routeDescription} (${vehicleName}) - ${job.internalRef || job.id}`,
          amount: prices.transferPrice,
        });
      }
      if (prices.driverTip > 0) {
        driverTipLines.push({
          trafficJobId: job.id,
          description: `Driver Tip: ${routeDescription} (${vehicleName}) - ${job.internalRef || job.id}`,
          amount: prices.driverTip,
        });
      }
    }

    const results: { transferInvoice: unknown; driverTipInvoice: unknown } = {
      transferInvoice: null,
      driverTipInvoice: null,
    };

    const currency = customer.currency as Currency;
    const issueDate = new Date(dto.issueDate);
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : new Date(issueDate.getTime() + (customer.creditDays || 30) * 24 * 60 * 60 * 1000);

    const invoiceInclude = {
      agent: true,
      customer: true,
      lines: { include: { trafficJob: true } },
    };

    // Create transfer invoice using AgentInvoice with customerId
    if (transferLines.length > 0) {
      const totalAmount = transferLines.reduce((sum, line) => sum + line.amount, 0);
      let invoiceNo = '';
      let attempts = 0;
      while (attempts < 5) {
        invoiceNo = this.generateCustomerInvoiceNumber('TRANSFER');
        const existing = await this.prisma.agentInvoice.findUnique({ where: { invoiceNumber: invoiceNo } });
        if (!existing) break;
        attempts++;
      }

      results.transferInvoice = await this.prisma.agentInvoice.create({
        data: {
          customerId: dto.customerId,
          agentId: null,
          invoiceNumber: invoiceNo,
          invoiceType: 'TRANSFER' as InvoiceType,
          invoiceDate: issueDate,
          dueDate,
          currency,
          subtotal: totalAmount,
          taxAmount: 0,
          total: totalAmount,
          exchangeRate: 1,
          status: InvoiceStatus.DRAFT,
          lines: {
            create: transferLines.map((line) => ({
              trafficJobId: line.trafficJobId,
              description: line.description,
              quantity: 1,
              unitPrice: line.amount,
              taxRate: 0,
              taxAmount: 0,
              lineTotal: line.amount,
            })),
          },
        },
        include: invoiceInclude,
      });
    }

    // Create driver tip invoice using AgentInvoice with customerId
    if (driverTipLines.length > 0) {
      const totalAmount = driverTipLines.reduce((sum, line) => sum + line.amount, 0);
      let invoiceNo = '';
      let attempts = 0;
      while (attempts < 5) {
        invoiceNo = this.generateCustomerInvoiceNumber('DRIVER_TIP');
        const existing = await this.prisma.agentInvoice.findUnique({ where: { invoiceNumber: invoiceNo } });
        if (!existing) break;
        attempts++;
      }

      results.driverTipInvoice = await this.prisma.agentInvoice.create({
        data: {
          customerId: dto.customerId,
          agentId: null,
          invoiceNumber: invoiceNo,
          invoiceType: 'DRIVER_TIP' as InvoiceType,
          invoiceDate: issueDate,
          dueDate,
          currency,
          subtotal: totalAmount,
          taxAmount: 0,
          total: totalAmount,
          exchangeRate: 1,
          status: InvoiceStatus.DRAFT,
          lines: {
            create: driverTipLines.map((line) => ({
              trafficJobId: line.trafficJobId,
              description: line.description,
              quantity: 1,
              unitPrice: line.amount,
              taxRate: 0,
              taxAmount: 0,
              lineTotal: line.amount,
            })),
          },
        },
        include: invoiceInclude,
      });
    }

    return results;
  }

  async getCustomerInvoice(id: string) {
    const invoice = await this.prisma.agentInvoice.findFirst({
      where: { id, customerId: { not: null } },
      include: {
        agent: true,
        customer: true,
        lines: { include: { trafficJob: true } },
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Customer invoice with ID "${id}" not found`);
    }

    return invoice;
  }

  async listCustomerInvoices(
    pagination: PaginationDto,
    customerId?: string,
    invoiceType?: string,
    status?: string,
  ) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { customerId: { not: null } };
    if (customerId) {
      where.customerId = customerId;
    }
    if (invoiceType) {
      where.invoiceType = invoiceType as InvoiceType;
    }
    if (status) {
      where.status = status as InvoiceStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.agentInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: true,
          customer: true,
          _count: { select: { lines: true, payments: true } },
        },
      }),
      this.prisma.agentInvoice.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  // ─────────────────────────────────────────────
  // AGENT OPTIONS & JOB FETCHING FOR INVOICES
  // ─────────────────────────────────────────────

  async getAgentOptions() {
    return this.prisma.agent.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        currency: true,
        creditTerms: {
          select: { creditLimit: true, creditDays: true },
        },
      },
      orderBy: { legalName: 'asc' },
    });
  }

  async getAgentJobsForInvoice(agentId: string, dateFrom: string, dateTo: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });
    if (!agent) {
      throw new NotFoundException(`Agent with ID "${agentId}" not found`);
    }

    const [jobs, priceItems] = await Promise.all([
      this.prisma.trafficJob.findMany({
        where: {
          agentId,
          status: 'COMPLETED' as any,
          deletedAt: null,
          jobDate: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo),
          },
          // Exclude jobs already linked to an invoice line
          invoiceLines: { none: {} },
        },
        include: {
          fromZone: { select: { id: true, name: true } },
          toZone: { select: { id: true, name: true } },
          originAirport: { select: { id: true, code: true, name: true } },
          destinationAirport: { select: { id: true, code: true, name: true } },
          originHotel: { select: { id: true, name: true } },
          destinationHotel: { select: { id: true, name: true } },
          flight: { select: { flightNo: true, carrier: true } },
          assignment: {
            include: {
              vehicle: {
                include: { vehicleType: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { jobDate: 'asc' },
      }),
      this.prisma.agentPriceItem.findMany({
        where: { agentId },
      }),
    ]);

    // Build price map: serviceType-fromZoneId-toZoneId-vehicleTypeId → priceItem
    const priceMap = new Map<string, typeof priceItems[0]>();
    for (const item of priceItems) {
      const key = `${item.serviceType}-${item.fromZoneId}-${item.toZoneId}-${item.vehicleTypeId}`;
      priceMap.set(key, item);
    }

    // Attach suggestedUnitPrice to each job
    return jobs.map((job) => {
      const vehicleTypeId = job.assignment?.vehicle?.vehicleType?.id;
      let suggestedUnitPrice = 0;

      if (job.fromZoneId && job.toZoneId && vehicleTypeId) {
        const key = `${job.serviceType}-${job.fromZoneId}-${job.toZoneId}-${vehicleTypeId}`;
        const priceItem = priceMap.get(key);
        if (priceItem) {
          suggestedUnitPrice = Number(priceItem.price)
            + (job.boosterSeatQty > 0 ? job.boosterSeatQty * Number(priceItem.boosterSeatPrice) : 0)
            + (job.babySeatQty > 0 ? job.babySeatQty * Number(priceItem.babySeatPrice) : 0)
            + (job.wheelChairQty > 0 ? job.wheelChairQty * Number(priceItem.wheelChairPrice) : 0);
        }
      }

      return { ...job, suggestedUnitPrice };
    });
  }
}
