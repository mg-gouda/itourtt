import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertExtraDto } from './dto/upsert-extra.dto.js';
import type { Currency } from '../../generated/prisma/enums.js';

@Injectable()
export class ExtrasService {
  constructor(private readonly prisma: PrismaService) {}

  // Admin: full list (active + inactive), ordered for management.
  async findAll() {
    return this.prisma.b2cExtra.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  // Public: only active extras for the B2C booking flow.
  async findActive() {
    const extras = await this.prisma.b2cExtra.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return extras.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      price: Number(e.price),
      currency: e.currency,
      imageUrl: e.imageUrl,
    }));
  }

  async create(dto: UpsertExtraDto) {
    return this.prisma.b2cExtra.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        currency: (dto.currency as Currency) ?? 'EGP',
        imageUrl: dto.imageUrl ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpsertExtraDto) {
    const existing = await this.prisma.b2cExtra.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Extra not found');
    return this.prisma.b2cExtra.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        ...(dto.currency !== undefined && { currency: dto.currency as Currency }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async toggleStatus(id: string) {
    const existing = await this.prisma.b2cExtra.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Extra not found');
    return this.prisma.b2cExtra.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.b2cExtra.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Extra not found');
    await this.prisma.b2cExtra.delete({ where: { id } });
    return { id };
  }
}
