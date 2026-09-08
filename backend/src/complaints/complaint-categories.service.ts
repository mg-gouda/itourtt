import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertComplaintCategoryDto } from './dto/upsert-complaint-category.dto.js';
import type { ComplaintParty } from '../../generated/prisma/enums.js';

@Injectable()
export class ComplaintCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.complaintCategory.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.complaintCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException(`Complaint category with ID "${id}" not found`);
    }
    return category;
  }

  async create(dto: UpsertComplaintCategoryDto) {
    return this.prisma.complaintCategory.create({
      data: {
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        defaultParty: (dto.defaultParty as ComplaintParty) ?? null,
        defaultPenaltyPoints: dto.defaultPenaltyPoints ?? 0,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpsertComplaintCategoryDto) {
    await this.findOne(id);
    return this.prisma.complaintCategory.update({
      where: { id },
      data: {
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        defaultParty: (dto.defaultParty as ComplaintParty) ?? null,
        defaultPenaltyPoints: dto.defaultPenaltyPoints ?? 0,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  /**
   * Soft delete. Refused while complaints still reference the category, so the
   * historical reason on an old complaint can never turn into a dangling id.
   */
  async remove(id: string) {
    await this.findOne(id);

    const inUse = await this.prisma.complaint.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `Cannot delete this category: ${inUse} complaint(s) still use it. Deactivate it instead.`,
      );
    }

    return this.prisma.complaintCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
