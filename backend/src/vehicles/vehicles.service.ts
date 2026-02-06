import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Vehicle Types ────────────────────────────────────────

  async findAllVehicleTypes() {
    return this.prisma.vehicleType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createVehicleType(dto: CreateVehicleTypeDto) {
    return this.prisma.vehicleType.create({
      data: {
        name: dto.name,
        seatCapacity: dto.seatCapacity,
      },
    });
  }

  // ─── Vehicles ─────────────────────────────────────────────

  async findAllVehicles(page: number, limit: number, vehicleTypeId?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (vehicleTypeId) {
      where.vehicleTypeId = vehicleTypeId;
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plateNumber: 'asc' },
        skip,
        take: limit,
        include: { vehicleType: true },
      }),
      this.prisma.vehicle.count({ where }),
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

  async findVehicleById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, deletedAt: null },
      include: { vehicleType: true },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${id} not found`);
    }

    return vehicle;
  }

  async createVehicle(dto: CreateVehicleDto) {
    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id: dto.vehicleTypeId },
    });
    if (!vehicleType) {
      throw new NotFoundException(`VehicleType with id ${dto.vehicleTypeId} not found`);
    }

    return this.prisma.vehicle.create({
      data: {
        plateNumber: dto.plateNumber,
        vehicleTypeId: dto.vehicleTypeId,
        ownership: dto.ownership,
      },
      include: { vehicleType: true },
    });
  }

  async updateVehicle(id: string, dto: Partial<CreateVehicleDto>) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${id} not found`);
    }

    if (dto.vehicleTypeId) {
      const vehicleType = await this.prisma.vehicleType.findUnique({
        where: { id: dto.vehicleTypeId },
      });
      if (!vehicleType) {
        throw new NotFoundException(`VehicleType with id ${dto.vehicleTypeId} not found`);
      }
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.plateNumber !== undefined && { plateNumber: dto.plateNumber }),
        ...(dto.vehicleTypeId !== undefined && { vehicleTypeId: dto.vehicleTypeId }),
        ...(dto.ownership !== undefined && { ownership: dto.ownership }),
      },
      include: { vehicleType: true },
    });
  }
}
