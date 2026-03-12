"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  EyeOff,
  XCircle,
  PlaneLanding,
  PlaneTakeoff,
  Bus,
  CalendarDays,
  Map,
  ArrowRightLeft,
  Repeat,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { localDateStr } from "@/lib/utils";

interface DashboardStats {
  todayJobs: number;
  unassignedJobs: number;
  assignmentRate: number;
  completionRate: number;
  noShowJobs: number;
  cancelledJobs: number;
  byServiceType: Record<string, number>;
  byStatus: Record<string, number>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendColor,
  iconColor,
  iconBg,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  trend?: string;
  trendColor?: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <Card className="border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-medium ${iconColor}`}>{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
          {trend && (
            <p className={`mt-1 flex items-center text-xs ${trendColor || "text-emerald-600 dark:text-emerald-400"}`}>
              <TrendingUp className="mr-1 h-3 w-3" />
              {trend}
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const t = useT();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => localDateStr(new Date()));
  const [stats, setStats] = useState<DashboardStats>({
    todayJobs: 0,
    unassignedJobs: 0,
    assignmentRate: 0,
    completionRate: 0,
    noShowJobs: 0,
    cancelledJobs: 0,
    byServiceType: {},
    byStatus: {},
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/daily-dispatch?date=${date}`);
      const report = res.data?.data ?? res.data;

      const byStatus = report.byStatus || {};
      const byServiceType = report.byServiceType || {};
      setStats({
        todayJobs: report.totalJobs || 0,
        unassignedJobs: report.unassignedCount || 0,
        assignmentRate: report.assignmentRate || 0,
        completionRate: report.completionRate || 0,
        noShowJobs: byStatus.NO_SHOW || 0,
        cancelledJobs: byStatus.CANCELLED || 0,
        byServiceType,
        byStatus,
      });
    } catch {
      // silently fail – dashboard still renders with zeros
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(selectedDate);
  }, [selectedDate, fetchStats]);

  const serviceTypeRows = [
    { key: "ARR", label: t("dashHome.arrivals"), icon: PlaneLanding, color: "text-blue-500", bg: "bg-blue-500/10" },
    { key: "DEP", label: t("dashHome.departures"), icon: PlaneTakeoff, color: "text-violet-500", bg: "bg-violet-500/10" },
    { key: "DAY_TOUR", label: t("dashHome.dayTour"), icon: Map, color: "text-amber-500", bg: "bg-amber-500/10" },
    { key: "ONE_WAY_TRANSFER", label: t("dashHome.oneWayTransfer"), icon: ArrowRightLeft, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { key: "TWO_WAY_TRANSFER", label: t("dashHome.twoWayTransfer"), icon: Repeat, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  ];

  const statusRows = [
    { key: "PENDING", label: t("dashHome.statusPending"), color: "text-amber-500", bg: "bg-amber-500" },
    { key: "ASSIGNED", label: t("dashHome.statusAssigned"), color: "text-blue-500", bg: "bg-blue-500" },
    { key: "IN_PROGRESS", label: t("dashHome.statusInProgress"), color: "text-indigo-500", bg: "bg-indigo-500" },
    { key: "COMPLETED", label: t("dashHome.statusCompleted"), color: "text-emerald-500", bg: "bg-emerald-500" },
    { key: "NO_SHOW", label: t("dashHome.noShow"), color: "text-orange-500", bg: "bg-orange-500" },
    { key: "CANCELLED", label: t("dashHome.cancelled"), color: "text-red-500", bg: "bg-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("dashHome.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashHome.overview")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="h-28 animate-pulse border-border bg-card" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="h-28 animate-pulse border-border bg-card" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={t("dashHome.todayJobs")}
              value={stats.todayJobs}
              icon={Briefcase}
              iconColor="text-blue-500"
              iconBg="bg-blue-500/10"
            />
            <StatCard
              label={t("dashHome.unassignedJobs")}
              value={stats.unassignedJobs}
              icon={AlertTriangle}
              iconColor="text-amber-500"
              iconBg="bg-amber-500/10"
              trend={stats.unassignedJobs > 0 ? t("dashHome.needsAttention") : undefined}
              trendColor="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              label={t("dashHome.assignmentRate")}
              value={`${stats.assignmentRate}%`}
              icon={UserCheck}
              iconColor="text-indigo-500"
              iconBg="bg-indigo-500/10"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={t("dashHome.completionRate")}
              value={`${stats.completionRate}%`}
              icon={CheckCircle2}
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
            />
            <StatCard
              label={t("dashHome.noShow")}
              value={stats.noShowJobs}
              icon={EyeOff}
              iconColor="text-orange-500"
              iconBg="bg-orange-500/10"
            />
            <StatCard
              label={t("dashHome.cancelled")}
              value={stats.cancelledJobs}
              icon={XCircle}
              iconColor="text-red-500"
              iconBg="bg-red-500/10"
            />
          </div>
        </div>
      )}

      {/* Interactive Stats */}
      {!loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Jobs by Service Type */}
          <Card className="border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              {t("dashHome.byServiceType")}
            </h3>
            <div className="space-y-3">
              {serviceTypeRows.map(({ key, label, icon: SIcon, color, bg }) => {
                const count = stats.byServiceType[key] || 0;
                const pct = stats.todayJobs > 0 ? Math.round((count / stats.todayJobs) * 100) : 0;
                return (
                  <button
                    key={key}
                    onClick={() => router.push(`/dashboard/dispatch`)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                      <SIcon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        <span className="text-sm font-semibold text-foreground">{count}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${color.replace("text-", "bg-")}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{pct}%</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Jobs by Status */}
          <Card className="border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              {t("dashHome.byStatus")}
            </h3>
            <div className="space-y-3">
              {statusRows.map(({ key, label, color, bg }) => {
                const count = stats.byStatus[key] || 0;
                const pct = stats.todayJobs > 0 ? Math.round((count / stats.todayJobs) * 100) : 0;
                return (
                  <button
                    key={key}
                    onClick={() => router.push(`/dashboard/traffic-jobs?status=${key}`)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${bg}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        <span className="text-sm font-semibold text-foreground">{count}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${bg}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{pct}%</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
