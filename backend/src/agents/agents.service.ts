import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAgentDto } from './dto/create-agent.dto.js';
import { UpdateAgentDto } from './dto/update-agent.dto.js';
import { UpdateCreditDto } from './dto/update-credit.dto.js';
import { UpdateInvoiceCycleDto } from './dto/update-invoice-cycle.dto.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import type { Currency, InvoiceCycleType, DocumentType } from '../../generated/prisma/enums.js';

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
      },
      include: {
        creditTerms: true,
        invoiceCycle: true,
        documents: true,
      },
    });
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
}
