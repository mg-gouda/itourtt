import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertTariffDto } from './dto/upsert-tariff.dto.js';
import type { Currency } from '../../generated/prisma/enums.js';

@Injectable()
export class DriverTariffsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { fromZoneId?: string; toZoneId?: string; vehicleTypeId?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.fromZoneId) where.fromZoneId = filters.fromZoneId;
    if (filters.toZoneId) where.toZoneId = filters.toZoneId;
    if (filters.vehicleTypeId) where.vehicleTypeId = filters.vehicleTypeId;

    return this.prisma.driverPriceTariff.findMany({
      where,
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
        vehicleType: { select: { id: true, name: true } },
        jobServiceType: { select: { id: true, name: true } },
      },
      orderBy: [
        { fromZone: { name: 'asc' } },
        { toZone: { name: 'asc' } },
        { vehicleType: { name: 'asc' } },
      ],
    });
  }

  async upsert(dto: UpsertTariffDto) {
    return this.prisma.driverPriceTariff.upsert({
      where: {
        fromZoneId_toZoneId_vehicleTypeId: {
          fromZoneId: dto.fromZoneId,
          toZoneId: dto.toZoneId,
          vehicleTypeId: dto.vehicleTypeId,
        },
      },
      update: {
        amount: dto.amount,
        currency: (dto.currency as Currency) ?? 'EGP',
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        jobServiceTypeId: dto.jobServiceTypeId ?? null,
      },
      create: {
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
        amount: dto.amount,
        currency: (dto.currency as Currency) ?? 'EGP',
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        jobServiceTypeId: dto.jobServiceTypeId ?? null,
      },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
        vehicleType: { select: { id: true, name: true } },
        jobServiceType: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.driverPriceTariff.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Driver tariff "${id}" not found`);
    }
    return this.prisma.driverPriceTariff.delete({ where: { id } });
  }

  /**
   * Look up a tariff for a given route + vehicle type.
   * Returns null if no matching tariff exists.
   */
  async lookup(fromZoneId: string, toZoneId: string, vehicleTypeId: string) {
    return this.prisma.driverPriceTariff.findFirst({
      where: {
        fromZoneId,
        toZoneId,
        vehicleTypeId,
        isActive: true,
      },
    });
  }
}
