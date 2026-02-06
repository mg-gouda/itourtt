import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JobStatus, ServiceType } from '../../generated/prisma/client.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // DAILY DISPATCH SUMMARY
  // ─────────────────────────────────────────────

  async dailyDispatchSummary(date: string) {
    const jobDate = new Date(date);

    const jobs = await this.prisma.trafficJob.findMany({
      where: { jobDate, deletedAt: null },
      include: {
        agent: true,
        assignment: {
          include: {
            vehicle: { include: { vehicleType: true } },
            driver: true,
            rep: true,
          },
        },
        flight: true,
        fromZone: true,
        toZone: true,
      },
    });

    const totalJobs = jobs.length;
    const byStatus: Record<string, number> = {};
    const byServiceType: Record<string, number> = {};
    let assignedCount = 0;
    let unassignedCount = 0;

    for (const job of jobs) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      byServiceType[job.serviceType] =
        (byServiceType[job.serviceType] || 0) + 1;
      if (job.assignment) {
        assignedCount++;
      } else {
        unassignedCount++;
      }
    }

    const completionRate =
      totalJobs > 0
        ? Math.round(
            ((byStatus['COMPLETED'] || 0) / totalJobs) * 100,
          )
        : 0;

    const assignmentRate =
      totalJobs > 0 ? Math.round((assignedCount / totalJobs) * 100) : 0;

    return {
      date,
      totalJobs,
      assignedCount,
      unassignedCount,
      completionRate,
      assignmentRate,
      byStatus,
      byServiceType,
      jobs,
    };
  }

  // ─────────────────────────────────────────────
  // DRIVER TRIP REPORT
  // ─────────────────────────────────────────────

  async driverTripReport(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId: { not: null },
        trafficJob: {
          jobDate: { gte: fromDate, lte: toDate },
          deletedAt: null,
        },
      },
      include: {
        driver: true,
        trafficJob: {
          include: {
            fromZone: true,
            toZone: true,
            agent: true,
          },
        },
      },
    });

    // Aggregate by driver
    const driverMap = new Map<
      string,
      {
        driver: { id: string; name: string; mobileNumber: string };
        tripCount: number;
        trips: Array<{
          jobDate: Date;
          serviceType: string;
          route: string;
          agent: string;
          internalRef: string;
        }>;
      }
    >();

    for (const a of assignments) {
      if (!a.driver) continue;
      const existing = driverMap.get(a.driverId!);
      const tripInfo = {
        jobDate: a.trafficJob.jobDate,
        serviceType: a.trafficJob.serviceType,
        route:
          a.trafficJob.fromZone && a.trafficJob.toZone
            ? `${a.trafficJob.fromZone.name} → ${a.trafficJob.toZone.name}`
            : '—',
        agent: a.trafficJob.agent?.legalName || '—',
        internalRef: a.trafficJob.internalRef,
      };

      if (existing) {
        existing.tripCount++;
        existing.trips.push(tripInfo);
      } else {
        driverMap.set(a.driverId!, {
          driver: {
            id: a.driver.id,
            name: a.driver.name,
            mobileNumber: a.driver.mobileNumber,
          },
          tripCount: 1,
          trips: [tripInfo],
        });
      }
    }

    // Also fetch driver fees for the period
    const fees = await this.prisma.driverTripFee.findMany({
      where: {
        trafficJob: {
          jobDate: { gte: fromDate, lte: toDate },
          deletedAt: null,
        },
      },
    });

    const feeByDriver = new Map<string, number>();
    for (const fee of fees) {
      const curr = feeByDriver.get(fee.driverId) || 0;
      feeByDriver.set(fee.driverId, curr + Number(fee.amount));
    }

    const drivers = Array.from(driverMap.values())
      .map((d) => ({
        ...d,
        totalFees: feeByDriver.get(d.driver.id) || 0,
      }))
      .sort((a, b) => b.tripCount - a.tripCount);

    return {
      from,
      to,
      totalDrivers: drivers.length,
      totalTrips: assignments.length,
      drivers,
    };
  }

  // ─────────────────────────────────────────────
  // AGENT STATEMENT
  // ─────────────────────────────────────────────

  async agentStatement(agentId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { creditTerms: true },
    });

    if (!agent) {
      return null;
    }

    // Invoices in period
    const invoices = await this.prisma.agentInvoice.findMany({
      where: {
        agentId,
        invoiceDate: { gte: fromDate, lte: toDate },
      },
      include: {
        lines: true,
        payments: true,
      },
      orderBy: { invoiceDate: 'asc' },
    });

    let totalInvoiced = 0;
    let totalPaid = 0;

    const invoiceRows = invoices.map((inv) => {
      const paid = inv.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      totalInvoiced += Number(inv.total);
      totalPaid += paid;

      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        subtotal: Number(inv.subtotal),
        taxAmount: Number(inv.taxAmount),
        total: Number(inv.total),
        paid,
        balance: Number(inv.total) - paid,
        status: inv.status,
        lineCount: inv.lines.length,
      };
    });

    // Jobs in period
    const jobCount = await this.prisma.trafficJob.count({
      where: {
        agentId,
        jobDate: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
    });

    return {
      agent: {
        id: agent.id,
        legalName: agent.legalName,
        tradeName: agent.tradeName,
        currency: agent.currency,
        creditLimit: agent.creditTerms
          ? Number(agent.creditTerms.creditLimit)
          : null,
        creditDays: agent.creditTerms?.creditDays || null,
      },
      period: { from, to },
      jobCount,
      totalInvoiced,
      totalPaid,
      outstandingBalance: totalInvoiced - totalPaid,
      invoices: invoiceRows,
    };
  }

  // ─────────────────────────────────────────────
  // REP FEE REPORT
  // ─────────────────────────────────────────────

  async repFeeReport(date: string) {
    const jobDate = new Date(date);

    // Query assignments where a rep is assigned for jobs on this date
    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId: { not: null },
        trafficJob: {
          jobDate,
          deletedAt: null,
        },
      },
      include: {
        rep: true,
        trafficJob: {
          include: {
            fromZone: true,
            toZone: true,
            flight: true,
            agent: true,
            repFees: true,
          },
        },
      },
    });

    // Aggregate by rep
    const repMap = new Map<
      string,
      {
        repId: string;
        repName: string;
        feePerFlight: number;
        flightCount: number;
        totalAmount: number;
        fees: Array<{
          id: string;
          amount: number;
          status: string;
          trafficJob: (typeof assignments)[number]['trafficJob'];
        }>;
      }
    >();

    for (const a of assignments) {
      if (!a.rep) continue;

      const repId = a.repId!;
      const feePerFlight = Number(a.rep.feePerFlight);

      // For ARR jobs, fee = actual RepFee amount if exists, otherwise rep.feePerFlight
      const isArr = a.trafficJob.serviceType === 'ARR';
      const existingFee = a.trafficJob.repFees.find((f) => f.repId === repId);
      const amount = existingFee
        ? Number(existingFee.amount)
        : isArr
          ? feePerFlight
          : 0;

      const feeEntry = {
        id: existingFee?.id || a.id,
        amount,
        status: existingFee ? 'POSTED' : a.trafficJob.status,
        trafficJob: a.trafficJob,
      };

      const existing = repMap.get(repId);
      if (existing) {
        if (isArr) {
          existing.flightCount++;
          existing.totalAmount += amount;
        }
        existing.fees.push(feeEntry);
      } else {
        repMap.set(repId, {
          repId,
          repName: a.rep.name,
          feePerFlight,
          flightCount: isArr ? 1 : 0,
          totalAmount: isArr ? amount : 0,
          fees: [feeEntry],
        });
      }
    }

    const reps = Array.from(repMap.values()).sort((a, b) =>
      a.repName.localeCompare(b.repName),
    );

    const grandTotal = reps.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalFlights = reps.reduce((sum, r) => sum + r.flightCount, 0);

    return {
      date,
      grandTotal,
      totalFlights,
      reps,
    };
  }

  // ─────────────────────────────────────────────
  // REVENUE REPORT
  // ─────────────────────────────────────────────

  async revenueReport(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Invoices in period
    const invoices = await this.prisma.agentInvoice.findMany({
      where: {
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' as any },
      },
      include: {
        agent: true,
        customer: true,
        lines: {
          include: {
            trafficJob: true,
          },
        },
      },
    });

    let totalRevenue = 0;
    const byAgent = new Map<
      string,
      { name: string; revenue: number; invoiceCount: number; jobCount: number }
    >();
    const byServiceType: Record<string, number> = {};

    for (const inv of invoices) {
      const invTotal = Number(inv.total);
      totalRevenue += invTotal;

      // By agent/customer (partner)
      const partnerId = inv.agentId || inv.customerId || 'unknown';
      const partnerName = inv.agent?.legalName || inv.customer?.legalName || 'Unknown';
      const agentEntry = byAgent.get(partnerId) || {
        name: partnerName,
        revenue: 0,
        invoiceCount: 0,
        jobCount: 0,
      };
      agentEntry.revenue += invTotal;
      agentEntry.invoiceCount++;
      byAgent.set(partnerId, agentEntry);

      // By service type from lines
      for (const line of inv.lines) {
        if (line.trafficJob) {
          const st = line.trafficJob.serviceType;
          byServiceType[st] = (byServiceType[st] || 0) + Number(line.lineTotal);

          const ae = byAgent.get(partnerId)!;
          ae.jobCount++;
        }
      }
    }

    // Costs in period
    const [driverFees, repFees, supplierCosts] = await Promise.all([
      this.prisma.driverTripFee.aggregate({
        where: {
          trafficJob: {
            jobDate: { gte: fromDate, lte: toDate },
            deletedAt: null,
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.repFee.aggregate({
        where: {
          trafficJob: {
            jobDate: { gte: fromDate, lte: toDate },
            deletedAt: null,
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.supplierCost.aggregate({
        where: {
          trafficJob: {
            jobDate: { gte: fromDate, lte: toDate },
            deletedAt: null,
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalDriverFees = Number(driverFees._sum.amount || 0);
    const totalRepFees = Number(repFees._sum.amount || 0);
    const totalSupplierCosts = Number(supplierCosts._sum.amount || 0);
    const totalCosts = totalDriverFees + totalRepFees + totalSupplierCosts;

    const agents = Array.from(byAgent.entries())
      .map(([id, data]) => ({ agentId: id, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      period: { from, to },
      totalRevenue,
      totalCosts,
      grossProfit: totalRevenue - totalCosts,
      profitMargin:
        totalRevenue > 0
          ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 100)
          : 0,
      costBreakdown: {
        driverFees: totalDriverFees,
        repFees: totalRepFees,
        supplierCosts: totalSupplierCosts,
      },
      byServiceType,
      byAgent: agents,
    };
  }
}
