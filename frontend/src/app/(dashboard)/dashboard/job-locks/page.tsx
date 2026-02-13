"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Lock, LockOpen, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";

type LockTab = "dispatcher" | "driver" | "rep" | "supplier";

interface JobLockItem {
  id: string;
  internalRef: string;
  jobDate: string;
  serviceType: string;
  status: string;
  clientName: string | null;
  isUnlocked: boolean;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  assignment?: {
    driver?: { id: string; name: string } | null;
    rep?: { id: string; name: string } | null;
    vehicle?: {
      id: string;
      plateNumber: string;
      supplier?: { id: string; legalName: string } | null;
    } | null;
  } | null;
}

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: to.toISOString().split("T")[0],
  };
}

function getEntityName(job: JobLockItem, tab: LockTab): string {
  if (!job.assignment) return "-";
  switch (tab) {
    case "dispatcher":
      return job.agent?.legalName || job.customer?.legalName || "-";
    case "driver":
      return job.assignment.driver?.name || "-";
    case "rep":
      return job.assignment.rep?.name || "-";
    case "supplier":
      return job.assignment.vehicle?.supplier?.legalName || "-";
    default:
      return "-";
  }
}

export default function JobLocksPage() {
  const t = useT();
  const defaults = getDefaultDateRange();
  const [activeTab, setActiveTab] = useState<LockTab>("dispatcher");
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<JobLockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchJobs = useCallback(
    async (tab: LockTab, from: string, to: string, searchStr: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ dateFrom: from, dateTo: to });
        if (searchStr) params.set("search", searchStr);
        const res = await api.get(`/job-locks/${tab}?${params.toString()}`);
        setJobs(res.data.data);
      } catch {
        toast.error(t("jobLocks.toggleFailed"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const handleSearch = () => {
    fetchJobs(activeTab, dateFrom, dateTo, search);
  };

  const handleTabChange = (tab: string) => {
    const lockTab = tab as LockTab;
    setActiveTab(lockTab);
    setJobs([]);
    fetchJobs(lockTab, dateFrom, dateTo, search);
  };

  const handleToggleLock = async (job: JobLockItem) => {
    setToggling(job.id);
    try {
      const action = job.isUnlocked ? "lock" : "unlock";
      await api.post(`/job-locks/${activeTab}/${job.id}/${action}`);
      toast.success(
        job.isUnlocked ? t("jobLocks.lockSuccess") : t("jobLocks.unlockSuccess"),
      );
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, isUnlocked: !j.isUnlocked } : j,
        ),
      );
    } catch {
      toast.error(t("jobLocks.toggleFailed"));
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("jobLocks.title")}
        description={t("jobLocks.description")}
      />

      <Card className="p-6">
        <Tabs
          defaultValue="dispatcher"
          value={activeTab}
          onValueChange={handleTabChange}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="dispatcher">
              {t("jobLocks.tabs.dispatcher")}
            </TabsTrigger>
            <TabsTrigger value="driver">
              {t("jobLocks.tabs.driver")}
            </TabsTrigger>
            <TabsTrigger value="rep">{t("jobLocks.tabs.rep")}</TabsTrigger>
            <TabsTrigger value="supplier">
              {t("jobLocks.tabs.supplier")}
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("jobLocks.filters.dateFrom")}
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("jobLocks.filters.dateTo")}
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                &nbsp;
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("jobLocks.filters.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-56 pl-8"
                />
              </div>
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {t("common.search")}
            </Button>
          </div>

          {/* Table content (same for all tabs) */}
          {["dispatcher", "driver", "rep", "supplier"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <JobLocksTable
                jobs={jobs}
                tab={tab as LockTab}
                loading={loading}
                toggling={toggling}
                onToggleLock={handleToggleLock}
                t={t}
              />
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </div>
  );
}

function JobLocksTable({
  jobs,
  tab,
  loading,
  toggling,
  onToggleLock,
  t,
}: {
  jobs: JobLockItem[];
  tab: LockTab;
  loading: boolean;
  toggling: string | null;
  onToggleLock: (job: JobLockItem) => void;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {t("jobLocks.noJobs")}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{t("jobLocks.table.lock")}</TableHead>
            <TableHead>{t("jobLocks.table.ref")}</TableHead>
            <TableHead>{t("jobLocks.table.entity")}</TableHead>
            <TableHead>{t("jobLocks.table.route")}</TableHead>
            <TableHead>{t("jobLocks.table.date")}</TableHead>
            <TableHead>{t("jobLocks.table.status")}</TableHead>
            <TableHead>{t("jobLocks.table.provider")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const isToggling = toggling === job.id;
            const route = [
              job.fromZone?.name,
              job.toZone?.name,
            ]
              .filter(Boolean)
              .join(" → ");
            const provider =
              job.agent?.legalName || job.customer?.legalName || "-";

            return (
              <TableRow key={job.id}>
                <TableCell>
                  <button
                    onClick={() => onToggleLock(job)}
                    disabled={isToggling}
                    className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted"
                    title={
                      job.isUnlocked ? t("jobLocks.lock") : t("jobLocks.unlock")
                    }
                  >
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : job.isUnlocked ? (
                      <LockOpen className="h-4 w-4 text-green-500" />
                    ) : (
                      <Lock className="h-4 w-4 text-amber-500" />
                    )}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {job.internalRef}
                </TableCell>
                <TableCell>{getEntityName(job, tab)}</TableCell>
                <TableCell className="text-sm">{route || "-"}</TableCell>
                <TableCell className="text-sm">
                  {new Date(job.jobDate).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      job.isUnlocked ? "default" : "secondary"
                    }
                    className={
                      job.isUnlocked
                        ? "bg-green-500/10 text-green-500 border-green-500/20"
                        : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    }
                  >
                    {job.isUnlocked
                      ? t("jobLocks.unlocked")
                      : t("jobLocks.locked")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{provider}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
