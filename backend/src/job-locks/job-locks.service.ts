import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type LockTab = 'dispatcher' | 'driver' | 'rep' | 'supplier' | 'edit' | 'b2c' | 'online' | 'all';

/**
 * Every independent unlock flag on a TrafficJob. The 'all' tab flips them
 * together; b2c/online reuse dispatch/edit so they are covered too.
 */
const ALL_UNLOCK_PARTS = ['dispatch', 'driver', 'rep', 'supplier', 'edit'] as const;

const PAGE_SIZE = 50;

@Injectable()
export class JobLocksService {
  constructor(private readonly prisma: PrismaService) {}

  async findJobs(
    tab: LockTab,
    dateFrom: string,
    dateTo: string,
    search?: string,
    page = 1,
    limit = PAGE_SIZE,
  ) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const skip = (page - 1) * limit;

    const baseWhere: Record<string, unknown> = {
      jobDate: { gte: from, lte: to },
      deletedAt: null,
    };

    if (search) {
      baseWhere.internalRef = { contains: search, mode: 'insensitive' };
    }

    // Tab-specific filters
    if (tab === 'driver') {
      baseWhere.assignment = { is: { driverId: { not: null } } };
    } else if (tab === 'rep') {
      baseWhere.assignment = { is: { repId: { not: null } } };
    } else if (tab === 'supplier') {
      baseWhere.assignment = {
        is: { vehicle: { supplierId: { not: null } } },
      };
    } else if (tab === 'b2c') {
      baseWhere.bookingChannel = 'B2C';
    } else if (tab === 'online') {
      baseWhere.bookingChannel = 'ONLINE';
    }

    const select = {
      id: true,
      internalRef: true,
      jobDate: true,
      serviceType: true,
      status: true,
      clientName: true,
      dispatchUnlockedAt: true,
      driverUnlockedAt: true,
      repUnlockedAt: true,
      supplierUnlockedAt: true,
      editUnlockedAt: true,
      agent: { select: { legalName: true } },
      customer: { select: { legalName: true } },
      fromZone: { select: { name: true } },
      toZone: { select: { name: true } },
      assignment: {
        select: {
          driver: { select: { id: true, name: true } },
          rep: { select: { id: true, name: true } },
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
              supplier: { select: { id: true, legalName: true } },
            },
          },
        },
      },
    };

    const [jobs, total] = await Promise.all([
      this.prisma.trafficJob.findMany({
        where: baseWhere,
        orderBy: { jobDate: 'desc' },
        skip,
        take: limit,
        select,
      }),
      this.prisma.trafficJob.count({ where: baseWhere }),
    ]);

    if (tab === 'all') {
      const data = jobs.map((job) => {
        const unlockedParts = ALL_UNLOCK_PARTS.filter(
          (p) => !!(job as any)[`${p}UnlockedAt`],
        );
        return {
          ...job,
          unlockedParts: unlockedParts.length,
          totalParts: ALL_UNLOCK_PARTS.length,
          // Fully unlocked only when every part is open; a partial job shows
          // as locked so one click opens the remainder.
          isUnlocked: unlockedParts.length === ALL_UNLOCK_PARTS.length,
        };
      });
      return { data, total, page, limit };
    }

    const unlockField = this.getUnlockField(tab);
    const data = jobs.map((job) => ({
      ...job,
      isUnlocked: !!(job as any)[unlockField],
    }));

    return { data, total, page, limit };
  }

  async unlockJob(tab: LockTab, jobId: string, userId: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) throw new NotFoundException(`Traffic job with ID "${jobId}" not found`);

    const data = this.getUnlockData(tab, userId);
    return this.prisma.trafficJob.update({
      where: { id: jobId },
      data,
      select: { id: true, internalRef: true },
    });
  }

  async lockJob(tab: LockTab, jobId: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) throw new NotFoundException(`Traffic job with ID "${jobId}" not found`);

    const data = this.getLockData(tab);
    return this.prisma.trafficJob.update({
      where: { id: jobId },
      data,
      select: { id: true, internalRef: true },
    });
  }

  private getUnlockField(tab: Exclude<LockTab, 'all'>): string {
    const map: Record<Exclude<LockTab, 'all'>, string> = {
      dispatcher: 'dispatchUnlockedAt',
      driver: 'driverUnlockedAt',
      rep: 'repUnlockedAt',
      supplier: 'supplierUnlockedAt',
      edit: 'editUnlockedAt',
      b2c: 'dispatchUnlockedAt',
      online: 'editUnlockedAt',
    };
    return map[tab];
  }

  private getUnlockData(tab: LockTab, userId: string): Record<string, unknown> {
    const now = new Date();
    if (tab === 'all') {
      return Object.fromEntries(
        ALL_UNLOCK_PARTS.flatMap((p) => [
          [`${p}UnlockedAt`, now],
          [`${p}UnlockedById`, userId],
        ]),
      );
    }
    const map: Record<Exclude<LockTab, 'all'>, Record<string, unknown>> = {
      dispatcher: { dispatchUnlockedAt: now, dispatchUnlockedById: userId },
      driver: { driverUnlockedAt: now, driverUnlockedById: userId },
      rep: { repUnlockedAt: now, repUnlockedById: userId },
      supplier: { supplierUnlockedAt: now, supplierUnlockedById: userId },
      edit: { editUnlockedAt: now, editUnlockedById: userId },
      b2c: { dispatchUnlockedAt: now, dispatchUnlockedById: userId },
      online: { editUnlockedAt: now, editUnlockedById: userId },
    };
    return map[tab];
  }

  private getLockData(tab: LockTab): Record<string, unknown> {
    if (tab === 'all') {
      return Object.fromEntries(
        ALL_UNLOCK_PARTS.flatMap((p) => [
          [`${p}UnlockedAt`, null],
          [`${p}UnlockedById`, null],
        ]),
      );
    }
    const map: Record<Exclude<LockTab, 'all'>, Record<string, unknown>> = {
      dispatcher: { dispatchUnlockedAt: null, dispatchUnlockedById: null },
      driver: { driverUnlockedAt: null, driverUnlockedById: null },
      rep: { repUnlockedAt: null, repUnlockedById: null },
      supplier: { supplierUnlockedAt: null, supplierUnlockedById: null },
      edit: { editUnlockedAt: null, editUnlockedById: null },
      b2c: { dispatchUnlockedAt: null, dispatchUnlockedById: null },
      online: { editUnlockedAt: null, editUnlockedById: null },
    };
    return map[tab];
  }
}
