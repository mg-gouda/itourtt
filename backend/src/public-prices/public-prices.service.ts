import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertPublicPricesDto } from './dto/upsert-public-prices.dto.js';
import type { ServiceType, Currency } from '../../generated/prisma/enums.js';

@Injectable()
export class PublicPricesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    serviceType?: string;
    fromZoneId?: string;
    toZoneId?: string;
    vehicleTypeId?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.serviceType) {
      where.serviceType = filters.serviceType as ServiceType;
    }
    if (filters.fromZoneId) {
      where.fromZoneId = filters.fromZoneId;
    }
    if (filters.toZoneId) {
      where.toZoneId = filters.toZoneId;
    }
    if (filters.vehicleTypeId) {
      where.vehicleTypeId = filters.vehicleTypeId;
    }

    return this.prisma.publicPriceItem.findMany({
      where,
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
      orderBy: [
        { serviceType: 'asc' },
        { fromZone: { name: 'asc' } },
      ],
    });
  }

  async bulkUpsert(dto: UpsertPublicPricesDto) {
    return this.prisma.$transaction(async (tx) => {
      const results: Awaited<ReturnType<typeof tx.publicPriceItem.upsert>>[] = [];

      for (const item of dto.items) {
        const result = await tx.publicPriceItem.upsert({
          where: {
            serviceType_fromZoneId_toZoneId_vehicleTypeId: {
              serviceType: item.serviceType as ServiceType,
              fromZoneId: item.fromZoneId,
              toZoneId: item.toZoneId,
              vehicleTypeId: item.vehicleTypeId,
            },
          },
          update: {
            price: item.price,
            driverTip: item.driverTip ?? 0,
            boosterSeatPrice: item.boosterSeatPrice ?? 0,
            babySeatPrice: item.babySeatPrice ?? 0,
            wheelChairPrice: item.wheelChairPrice ?? 0,
            currency: (item.currency as Currency) || 'EGP',
          },
          create: {
            serviceType: item.serviceType as ServiceType,
            fromZoneId: item.fromZoneId,
            toZoneId: item.toZoneId,
            vehicleTypeId: item.vehicleTypeId,
            price: item.price,
            driverTip: item.driverTip ?? 0,
            boosterSeatPrice: item.boosterSeatPrice ?? 0,
            babySeatPrice: item.babySeatPrice ?? 0,
            wheelChairPrice: item.wheelChairPrice ?? 0,
            currency: (item.currency as Currency) || 'EGP',
          },
          include: {
            fromZone: true,
            toZone: true,
            vehicleType: true,
          },
        });

        results.push(result);
      }

      return results;
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.publicPriceItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Public price item with ID "${id}" not found`);
    }

    return this.prisma.publicPriceItem.delete({
      where: { id },
    });
  }
}
