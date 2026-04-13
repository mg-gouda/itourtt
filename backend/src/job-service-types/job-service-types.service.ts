import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateJobServiceTypeDto } from './dto/create-job-service-type.dto.js';

@Injectable()
export class JobServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.jobServiceType.findMany({
      where: { isActive: true },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateJobServiceTypeDto) {
    const existing = await this.prisma.jobServiceType.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(`Service type "${dto.name}" already exists`);
    }
    return this.prisma.jobServiceType.create({
      data: {
        name: dto.name.trim(),
        fromZoneId: dto.fromZoneId ?? null,
        toZoneId: dto.toZoneId ?? null,
        isActive: dto.isActive ?? true,
      },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: Partial<CreateJobServiceTypeDto>) {
    const existing = await this.prisma.jobServiceType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Service type "${id}" not found`);
    return this.prisma.jobServiceType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.fromZoneId !== undefined && { fromZoneId: dto.fromZoneId }),
        ...(dto.toZoneId !== undefined && { toZoneId: dto.toZoneId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.jobServiceType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Service type "${id}" not found`);
    return this.prisma.jobServiceType.delete({ where: { id } });
  }
}
