import { Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueryActivityLogDto } from './dto/query-activity-log.dto.js';

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryActivityLogDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.entity) {
      where.entity = query.entity;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (query.search) {
      where.summary = { contains: query.search, mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          userName: true,
          action: true,
          entity: true,
          entityId: true,
          summary: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const log = await this.prisma.activityLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Activity log not found');
    return log;
  }

  async exportToExcel(query: QueryActivityLogDto): Promise<Buffer> {
    // Fetch all matching records (no pagination for export)
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.entity) where.entity = query.entity;
    if (query.action) where.action = query.action;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (query.search) {
      where.summary = { contains: query.search, mode: 'insensitive' };
    }

    const logs = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const rows = logs.map((l) => ({
      'Date & Time': l.createdAt.toISOString().replace('T', ' ').slice(0, 19),
      User: l.userName,
      Action: l.action,
      Entity: l.entity,
      'Entity ID': l.entityId || '',
      Summary: l.summary,
      'IP Address': l.ipAddress || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Log');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  /** Get distinct entity names for filter dropdown */
  async getDistinctEntities(): Promise<string[]> {
    const result = await this.prisma.activityLog.findMany({
      distinct: ['entity'],
      select: { entity: true },
      orderBy: { entity: 'asc' },
    });
    return result.map((r) => r.entity);
  }
}
