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

    // Verify all traffic jobs in lines exist
    const jobIds = dto.lines.map((line) => line.trafficJobId);
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

    // Calculate totals from lines
    const totalAmount = dto.lines.reduce((sum, line) => sum + line.amount, 0);
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
          subtotal: totalAmount,
          taxAmount: 0,
          total: totalAmount,
          exchangeRate: 1,
          status: InvoiceStatus.DRAFT,
          lines: {
            create: dto.lines.map((line) => ({
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

    return invoice;
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

    const [data, total] = await Promise.all([
      this.prisma.agentInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: true,
          customer: true,
          _count: {
            select: { lines: true, payments: true },
          },
        },
      }),
      this.prisma.agentInvoice.count({ where }),
    ]);

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
}
