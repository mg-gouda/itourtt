import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { AssignVehicleDto } from './dto/assign-vehicle.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto, isActive?: boolean) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          driverVehicles: {
            where: { unassignedAt: null },
            include: { vehicle: { include: { vehicleType: true } } },
          },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, deletedAt: null },
      include: {
        driverVehicles: {
          where: { unassignedAt: null },
          include: { vehicle: { include: { vehicleType: true } } },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID "${id}" not found`);
    }

    return driver;
  }

  async create(dto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: {
        name: dto.name,
        mobileNumber: dto.mobileNumber,
        licenseNumber: dto.licenseNumber,
        licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateDriverDto) {
    await this.findOne(id);

    return this.prisma.driver.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.mobileNumber !== undefined && { mobileNumber: dto.mobileNumber }),
        ...(dto.licenseNumber !== undefined && { licenseNumber: dto.licenseNumber }),
        ...(dto.licenseExpiryDate !== undefined && {
          licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : null,
        }),
      },
    });
  }

  async updateAttachment(id: string, url: string) {
    await this.findOne(id);
    return this.prisma.driver.update({
      where: { id },
      data: { attachmentUrl: url },
    });
  }

  async assignVehicle(driverId: string, dto: AssignVehicleDto) {
    await this.findOne(driverId);

    // Verify vehicle exists
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID "${dto.vehicleId}" not found`);
    }

    // Check if assignment already exists (active)
    const existing = await this.prisma.driverVehicle.findFirst({
      where: {
        driverId,
        vehicleId: dto.vehicleId,
        unassignedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('This vehicle is already assigned to this driver');
    }

    // If isPrimary requested, unset any existing primary for this driver
    if (dto.isPrimary) {
      await this.prisma.driverVehicle.updateMany({
        where: { driverId, isPrimary: true, unassignedAt: null },
        data: { isPrimary: false },
      });
    }

    return this.prisma.driverVehicle.create({
      data: {
        driverId,
        vehicleId: dto.vehicleId,
        isPrimary: dto.isPrimary ?? false,
      },
      include: {
        vehicle: { include: { vehicleType: true } },
      },
    });
  }

  async unassignVehicle(driverId: string, vehicleId: string) {
    const assignment = await this.prisma.driverVehicle.findFirst({
      where: {
        driverId,
        vehicleId,
        unassignedAt: null,
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Active assignment for driver "${driverId}" and vehicle "${vehicleId}" not found`,
      );
    }

    return this.prisma.driverVehicle.update({
      where: { id: assignment.id },
      data: { unassignedAt: new Date() },
    });
  }
}
