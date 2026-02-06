import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { CreateTripPriceDto } from './dto/create-trip-price.dto.js';
import type { Currency } from '../../generated/prisma/enums.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Supplier CRUD ──────────────────────────────────────────

  async findAll(page: number, limit: number, isActive?: boolean) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { legalName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, deletedAt: null },
      include: {
        tripPrices: {
          orderBy: { effectiveFrom: 'desc' },
          include: {
            fromZone: true,
            toZone: true,
            vehicleType: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${id} not found`);
    }

    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
      },
    });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${id} not found`);
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
      },
    });
  }

  // ─── Trip Prices ────────────────────────────────────────────

  async findTripPrices(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    return this.prisma.supplierTripPrice.findMany({
      where: { supplierId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
    });
  }

  async createTripPrice(supplierId: string, dto: CreateTripPriceDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    return this.prisma.supplierTripPrice.create({
      data: {
        supplierId,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
        price: dto.price,
        currency: (dto.currency as Currency) ?? undefined,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
    });
  }

  async updateTripPrice(priceId: string, dto: CreateTripPriceDto) {
    const tripPrice = await this.prisma.supplierTripPrice.findUnique({
      where: { id: priceId },
    });

    if (!tripPrice) {
      throw new NotFoundException(`Trip price with id ${priceId} not found`);
    }

    return this.prisma.supplierTripPrice.update({
      where: { id: priceId },
      data: {
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
        price: dto.price,
        currency: (dto.currency as Currency) ?? undefined,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
    });
  }
}
