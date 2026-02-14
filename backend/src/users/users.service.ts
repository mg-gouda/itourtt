import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { UserRole } from '../../generated/prisma/enums.js';

/** Fields to exclude from public-facing user responses. */
const SENSITIVE_FIELDS = {
  passwordHash: true,
  refreshToken: true,
} as const;

/** Prisma `omit` object for safe user projection. */
const SAFE_USER_OMIT = {
  passwordHash: true as const,
  refreshToken: true as const,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        ...(dto.roleId && { roleId: dto.roleId }),
      },
      omit: SAFE_USER_OMIT,
    });

    return user;
  }

  // ──────────────────────────────────────────────
  // READ – paginated list
  // ──────────────────────────────────────────────

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: SAFE_USER_OMIT,
        include: { roleRef: { select: { name: true, slug: true } } },
      }),
      this.prisma.user.count({
        where: { deletedAt: null },
      }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ──────────────────────────────────────────────
  // READ – single user (safe)
  // ──────────────────────────────────────────────

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: SAFE_USER_OMIT,
    });

    if (!user || user.deletedAt !== null) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ──────────────────────────────────────────────
  // READ – by email (for auth – includes passwordHash)
  // ──────────────────────────────────────────────

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // ──────────────────────────────────────────────
  // UPDATE – profile fields
  // ──────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureUserExists(id);

    if (dto.email) {
      const conflict = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
      omit: SAFE_USER_OMIT,
    });

    return user;
  }

  // ──────────────────────────────────────────────
  // UPDATE – role (ADMIN only)
  // ──────────────────────────────────────────────

  async updateRole(id: string, role: UserRole) {
    await this.ensureUserExists(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
      omit: SAFE_USER_OMIT,
    });

    return user;
  }

  // ──────────────────────────────────────────────
  // SOFT-DEACTIVATE
  // ──────────────────────────────────────────────

  async deactivate(id: string) {
    await this.ensureUserExists(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      omit: SAFE_USER_OMIT,
    });

    return user;
  }

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
