import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAgentDto } from './dto/create-agent.dto.js';
import { UpdateAgentDto } from './dto/update-agent.dto.js';
import { UpdateCreditDto } from './dto/update-credit.dto.js';
import { UpdateInvoiceCycleDto } from './dto/update-invoice-cycle.dto.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { BulkAgentPriceListDto, AgentPriceItemDto } from './dto/agent-price-list.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import type { Currency, InvoiceCycleType, DocumentType, ServiceType } from '../../generated/prisma/enums.js';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto, isActive?: boolean) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creditTerms: true,
          invoiceCycle: true,
        },
      }),
      this.prisma.agent.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      include: {
        creditTerms: true,
        invoiceCycle: true,
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID "${id}" not found`);
    }

    return agent;
  }

  async create(dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
        ...(dto.currency && { currency: dto.currency as Currency }),
        refPattern: dto.refPattern ?? null,
        refExample: dto.refExample ?? null,
      },
      include: {
        creditTerms: true,
        invoiceCycle: true,
      },
    });
  }

  async update(id: string, dto: UpdateAgentDto) {
    await this.findOne(id);

    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.legalName !== undefined && { legalName: dto.legalName }),
        ...(dto.tradeName !== undefined && { tradeName: dto.tradeName }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.currency !== undefined && { currency: dto.currency as Currency }),
        ...(dto.refPattern !== undefined && { refPattern: dto.refPattern }),
        ...(dto.refExample !== undefined && { refExample: dto.refExample }),
      },
      include: {
        creditTerms: true,
        invoiceCycle: true,
        documents: true,
      },
    });
  }

  async toggleStatus(id: string) {
    const agent = await this.findOne(id);

    return this.prisma.agent.update({
      where: { id },
      data: { isActive: !agent.isActive },
    });
  }

  async getCreditStatus(agentId: string) {
    const agent = await this.findOne(agentId);
    const creditTerms = await this.prisma.agentCreditTerms.findUnique({
      where: { agentId },
    });

    const outstandingResult = await this.prisma.agentInvoice.aggregate({
      where: {
        agentId,
        status: { in: ['DRAFT', 'POSTED'] as any },
      },
      _sum: { total: true },
    });

    const creditLimit = creditTerms ? Number(creditTerms.creditLimit) : 0;
    const creditDays = creditTerms ? creditTerms.creditDays : 0;
    const outstandingBalance = Number(outstandingResult._sum.total || 0);
    const availableCredit = Math.max(0, creditLimit - outstandingBalance);
    const utilizationPercent =
      creditLimit > 0
        ? parseFloat(((outstandingBalance / creditLimit) * 100).toFixed(1))
        : 0;

    return {
      agentId,
      agentName: agent.legalName,
      creditLimit,
      creditDays,
      outstandingBalance,
      availableCredit,
      utilizationPercent,
    };
  }

  async updateCredit(agentId: string, dto: UpdateCreditDto) {
    await this.findOne(agentId);

    return this.prisma.agentCreditTerms.upsert({
      where: { agentId },
      create: {
        agentId,
        creditLimit: dto.creditLimit,
        creditDays: dto.creditDays,
      },
      update: {
        creditLimit: dto.creditLimit,
        creditDays: dto.creditDays,
      },
    });
  }

  async updateInvoiceCycle(agentId: string, dto: UpdateInvoiceCycleDto) {
    await this.findOne(agentId);

    return this.prisma.agentInvoiceCycle.upsert({
      where: { agentId },
      create: {
        agentId,
        cycleType: dto.cycleType as InvoiceCycleType,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
      },
      update: {
        cycleType: dto.cycleType as InvoiceCycleType,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
      },
    });
  }

  async createDocument(agentId: string, dto: CreateDocumentDto) {
    await this.findOne(agentId);

    return this.prisma.agentDocument.create({
      data: {
        agentId,
        documentType: dto.documentType as DocumentType,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        ...(dto.expiresAt && { expiresAt: new Date(dto.expiresAt) }),
      },
    });
  }

  async findDocuments(agentId: string) {
    await this.findOne(agentId);

    return this.prisma.agentDocument.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Price List (Bulk Upsert Pattern) ───────────────────────

  async getPriceList(agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with id ${agentId} not found`);
    }

    return this.prisma.agentPriceItem.findMany({
      where: { agentId },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
        vehicleType: { select: { id: true, name: true, seatCapacity: true } },
      },
      orderBy: [
        { serviceType: 'asc' },
        { fromZone: { name: 'asc' } },
        { toZone: { name: 'asc' } },
        { vehicleType: { seatCapacity: 'asc' } },
      ],
    });
  }

  async upsertPriceItems(agentId: string, dto: BulkAgentPriceListDto) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with id ${agentId} not found`);
    }

    const results = await this.prisma.$transaction(
      dto.items.map((item: AgentPriceItemDto) =>
        this.prisma.agentPriceItem.upsert({
          where: {
            agentId_serviceType_fromZoneId_toZoneId_vehicleTypeId: {
              agentId,
              serviceType: item.serviceType as ServiceType,
              fromZoneId: item.fromZoneId,
              toZoneId: item.toZoneId,
              vehicleTypeId: item.vehicleTypeId,
            },
          },
          create: {
            agentId,
            serviceType: item.serviceType as ServiceType,
            fromZoneId: item.fromZoneId,
            toZoneId: item.toZoneId,
            vehicleTypeId: item.vehicleTypeId,
            price: item.price,
            driverTip: item.driverTip,
            boosterSeatPrice: item.boosterSeatPrice ?? 0,
            babySeatPrice: item.babySeatPrice ?? 0,
            wheelChairPrice: item.wheelChairPrice ?? 0,
            effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : null,
            effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
          },
          update: {
            price: item.price,
            driverTip: item.driverTip,
            boosterSeatPrice: item.boosterSeatPrice ?? 0,
            babySeatPrice: item.babySeatPrice ?? 0,
            wheelChairPrice: item.wheelChairPrice ?? 0,
            effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : null,
            effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
          },
        }),
      ),
    );

    return results;
  }

  async deletePriceItem(agentId: string, priceItemId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with id ${agentId} not found`);
    }

    const priceItem = await this.prisma.agentPriceItem.findFirst({
      where: { id: priceItemId, agentId },
    });

    if (!priceItem) {
      throw new NotFoundException(`Price item with id "${priceItemId}" not found for this agent`);
    }

    return this.prisma.agentPriceItem.delete({
      where: { id: priceItemId },
    });
  }
}
