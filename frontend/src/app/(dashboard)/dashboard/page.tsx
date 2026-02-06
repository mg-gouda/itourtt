"use client";

import { useEffect, useState } from "react";
import {
  Briefcase,
  CalendarClock,
  Car,
  Building2,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import api from "@/lib/api";

interface DashboardStats {
  todayJobs: number;
  pendingAssignments: number;
  activeVehicles: number;
  activeAgents: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <Card className="border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
          {trend && (
            <p className="mt-1 flex items-center text-xs text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="mr-1 h-3 w-3" />
              {trend}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    todayJobs: 0,
    pendingAssignments: 0,
    activeVehicles: 0,
    activeAgents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const today = new Date().toISOString().split("T")[0];
        const [jobsRes, vehiclesRes] = await Promise.allSettled([
          api.get(`/dispatch/day?date=${today}`),
          api.get("/vehicles/types"),
        ]);

        const todayJobs =
          jobsRes.status === "fulfilled"
            ? (jobsRes.value.data.arrivals?.length || 0) +
              (jobsRes.value.data.departures?.length || 0) +
              (jobsRes.value.data.cityTransfers?.length || 0)
            : 0;

        const pendingAssignments =
          jobsRes.status === "fulfilled"
            ? [
                ...(jobsRes.value.data.arrivals || []),
                ...(jobsRes.value.data.departures || []),
                ...(jobsRes.value.data.cityTransfers || []),
              ].filter(
                (j: { status: string }) => j.status === "PENDING"
              ).length
            : 0;

        const activeVehicles =
          vehiclesRes.status === "fulfilled"
            ? vehiclesRes.value.data?.length || 0
            : 0;

        setStats({
          todayJobs,
          pendingAssignments,
          activeVehicles,
          activeAgents: 0,
        });
      } catch {
        // silently fail – dashboard still renders with zeros
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of today&apos;s operations
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card
              key={i}
              className="h-28 animate-pulse border-border bg-card"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Today's Jobs"
            value={stats.todayJobs}
            icon={Briefcase}
          />
          <StatCard
            label="Pending Assignments"
            value={stats.pendingAssignments}
            icon={AlertTriangle}
          />
          <StatCard
            label="Vehicle Types"
            value={stats.activeVehicles}
            icon={Car}
          />
          <StatCard
            label="Active Agents"
            value={stats.activeAgents}
            icon={Building2}
          />
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-medium text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a href="/dashboard/dispatch">
            <Card className="cursor-pointer border-border bg-card p-4 transition-colors hover:bg-accent">
              <div className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Dispatch Console
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Manage today&apos;s assignments
                  </p>
                </div>
              </div>
            </Card>
          </a>
          <a href="/dashboard/traffic-jobs">
            <Card className="cursor-pointer border-border bg-card p-4 transition-colors hover:bg-accent">
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Traffic Jobs
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Create and manage bookings
                  </p>
                </div>
              </div>
            </Card>
          </a>
          <a href="/dashboard/finance">
            <Card className="cursor-pointer border-border bg-card p-4 transition-colors hover:bg-accent">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Finance
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Invoices, payments & exports
                  </p>
                </div>
              </div>
            </Card>
          </a>
        </div>
      </div>
    </div>
  );
}
