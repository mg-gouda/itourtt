import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRepDto } from './dto/create-rep.dto.js';
import { UpdateRepDto } from './dto/update-rep.dto.js';
import { AssignZoneDto } from './dto/assign-zone.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';

@Injectable()
export class RepsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = { deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.rep.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
          repZones: {
            include: {
              zone: {
                include: {
                  city: {
                    include: { airport: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.rep.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const rep = await this.prisma.rep.findFirst({
      where: { id, deletedAt: null },
      include: {
        repZones: {
          include: {
            zone: {
              include: {
                city: {
                  include: { airport: true },
                },
              },
            },
          },
        },
      },
    });

    if (!rep) {
      throw new NotFoundException(`Rep with ID "${id}" not found`);
    }

    return rep;
  }

  async create(dto: CreateRepDto) {
    return this.prisma.rep.create({
      data: {
        name: dto.name,
        mobileNumber: dto.mobileNumber,
        ...(dto.feePerFlight !== undefined && { feePerFlight: dto.feePerFlight }),
      },
    });
  }

  async update(id: string, dto: UpdateRepDto) {
    await this.findOne(id);

    return this.prisma.rep.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.mobileNumber !== undefined && { mobileNumber: dto.mobileNumber }),
        ...(dto.feePerFlight !== undefined && { feePerFlight: dto.feePerFlight }),
      },
    });
  }

  async updateAttachment(id: string, url: string) {
    await this.findOne(id);
    return this.prisma.rep.update({
      where: { id },
      data: { attachmentUrl: url },
    });
  }

  async assignZone(repId: string, dto: AssignZoneDto) {
    await this.findOne(repId);

    // Verify zone exists
    const zone = await this.prisma.zone.findFirst({
      where: { id: dto.zoneId, deletedAt: null },
    });
    if (!zone) {
      throw new NotFoundException(`Zone with ID "${dto.zoneId}" not found`);
    }

    // Check if assignment already exists
    const existing = await this.prisma.repZone.findUnique({
      where: {
        repId_zoneId: {
          repId,
          zoneId: dto.zoneId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('This zone is already assigned to this rep');
    }

    return this.prisma.repZone.create({
      data: {
        repId,
        zoneId: dto.zoneId,
      },
      include: {
        zone: {
          include: {
            city: {
              include: { airport: true },
            },
          },
        },
      },
    });
  }

  async unassignZone(repId: string, zoneId: string) {
    const assignment = await this.prisma.repZone.findUnique({
      where: {
        repId_zoneId: {
          repId,
          zoneId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Zone assignment for rep "${repId}" and zone "${zoneId}" not found`,
      );
    }

    return this.prisma.repZone.delete({
      where: { id: assignment.id },
    });
  }

  async createUserAccount(repId: string, dto: { email: string; password: string }) {
    const rep = await this.findOne(repId);

    if (rep.userId) {
      throw new ConflictException('This rep already has a user account');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: rep.name,
          role: 'REP',
        },
      });

      await tx.rep.update({
        where: { id: repId },
        data: { userId: user.id },
      });

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    });
  }

  async resetPassword(repId: string, newPassword: string) {
    const rep = await this.findOne(repId);

    if (!rep.userId) {
      throw new BadRequestException('This rep does not have a user account');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: rep.userId },
      data: { passwordHash, refreshToken: null },
    });

    return { success: true };
  }
}
