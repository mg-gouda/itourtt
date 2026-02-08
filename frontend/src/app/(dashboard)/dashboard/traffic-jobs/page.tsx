"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Loader2,
  Search,
  Filter,
  Plus,
  Printer,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { SortableHeader } from "@/components/sortable-header";
import { useSortable } from "@/hooks/use-sortable";

interface TrafficJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  bookingChannel: "ONLINE" | "B2B";
  serviceType: string;
  jobDate: string;
  createdAt: string;
  status: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName: string | null;
  clientMobile: string | null;
  pickUpTime: string | null;
  notes: string | null;
  boosterSeat: boolean;
  boosterSeatQty: number;
  babySeat: boolean;
  babySeatQty: number;
  wheelChair: boolean;
  wheelChairQty: number;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  originAirport?: { name: string; code: string } | null;
  originZone?: { name: string } | null;
  originHotel?: { name: string } | null;
  destinationAirport?: { name: string; code: string } | null;
  destinationZone?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  flight?: { flightNo: string; terminal?: string; arrivalTime?: string } | null;
  createdBy?: { id: string; name: string } | null;
  assignment?: {
    vehicle?: { plateNumber: string };
    driver?: { name: string };
    rep?: { name: string };
  } | null;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  ASSIGNED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  COMPLETED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  NO_SHOW: "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30",
};

export default function TrafficJobsPage() {
  const t = useT();
  const locale = useLocaleId();
  const router = useRouter();
  const [jobs, setJobs] = useState<TrafficJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [generatingSigns, setGeneratingSigns] = useState(false);

  const serviceTypeLabels: Record<string, string> = {
    ARR: t("serviceType.ARR"),
    DEP: t("serviceType.DEP"),
    EXCURSION: t("serviceType.EXCURSION"),
    ROUND_TRIP: t("serviceType.ROUND_TRIP"),
    ONE_WAY_GOING: t("serviceType.ONE_WAY_GOING"),
    ONE_WAY_RETURN: t("serviceType.ONE_WAY_RETURN"),
    OVER_DAY: t("serviceType.OVER_DAY"),
    TRANSFER: t("serviceType.TRANSFER"),
    CITY_TOUR: t("serviceType.CITY_TOUR"),
    COLLECTING_ONE_WAY: t("serviceType.COLLECTING_ONE_WAY"),
    COLLECTING_ROUND_TRIP: t("serviceType.COLLECTING_ROUND_TRIP"),
    EXPRESS_SHOPPING: t("serviceType.EXPRESS_SHOPPING"),
  };

  const fetchJobs = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "ALL") params.status = filterStatus;
      const { data } = await api.get("/traffic-jobs", { params });
      setJobs(Array.isArray(data) ? data : data.data || []);
    } catch {
      toast.error(t("jobs.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handlePrintSigns = async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    setGeneratingSigns(true);
    try {
      const res = await api.get(`/export/odoo/client-signs?date=${tomorrow}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err: any) {
      if (err.response?.status === 404) {
        toast.error(t("jobs.noSignJobs"));
      } else {
        toast.error(t("jobs.failedLoad"));
      }
    } finally {
      setGeneratingSigns(false);
    }
  };

  const filtered = jobs.filter((j) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        j.internalRef?.toLowerCase().includes(q) ||
        j.agentRef?.toLowerCase().includes(q) ||
        j.agent?.legalName?.toLowerCase().includes(q) ||
        j.customer?.legalName?.toLowerCase().includes(q) ||
        j.clientName?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const { sortedData, sortKey, sortDir, onSort } = useSortable(filtered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("jobs.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("jobs.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-border"
            disabled={generatingSigns}
            onClick={handlePrintSigns}
          >
            {generatingSigns ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            {generatingSigns ? t("jobs.generatingSigns") : t("jobs.printSigns")}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => router.push("/dashboard/traffic-jobs/online")}
          >
            <Plus className="h-4 w-4" />
            {t("jobs.newOnlineJob")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-border"
            onClick={() => router.push("/dashboard/traffic-jobs/b2b")}
          >
            <Plus className="h-4 w-4" />
            {t("jobs.newB2BJob")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder={t("jobs.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border bg-card pl-9 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-foreground">
              <SelectItem value="ALL">{t("jobs.allStatus")}</SelectItem>
              <SelectItem value="PENDING">{t("jobs.pending")}</SelectItem>
              <SelectItem value="ASSIGNED">{t("jobs.assigned")}</SelectItem>
              <SelectItem value="IN_PROGRESS">{t("jobs.inProgress")}</SelectItem>
              <SelectItem value="COMPLETED">{t("jobs.completed")}</SelectItem>
              <SelectItem value="CANCELLED">{t("jobs.cancelled")}</SelectItem>
              <SelectItem value="NO_SHOW">{t("jobs.noShow")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Briefcase className="mb-2 h-8 w-8" />
            <p>{t("jobs.noJobs")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                <SortableHeader label={t("jobs.bookingDate")} sortKey="createdAt" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("dispatch.ref")} sortKey="internalRef" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("jobs.channel")} sortKey="bookingChannel" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("jobs.type")} sortKey="serviceType" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("jobs.serviceDate")} sortKey="jobDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("jobs.pickUpTime")} sortKey="pickUpTime" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">{t("jobs.agentCustomer")}</TableHead>
                <SortableHeader label={t("jobs.clientName")} sortKey="clientName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">{t("jobs.clientNumber")}</TableHead>
                <SortableHeader label={t("jobs.ad")} sortKey="adultCount" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("jobs.chd")} sortKey="childCount" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">{t("jobs.origin")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.destination")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.flightNumber")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.terminal")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.arrivalTime")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.extras")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.notes")}</TableHead>
                <SortableHeader label={t("common.status")} sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">{t("jobs.assignment")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.userLog")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((job, idx) => (
                <TableRow
                  key={job.id}
                  className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                >
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-foreground font-mono text-xs whitespace-nowrap">
                    {job.internalRef}
                    {job.agentRef && (
                      <span className="ml-1 text-muted-foreground">
                        ({job.agentRef})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        job.bookingChannel === "ONLINE"
                          ? "bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"
                      }
                    >
                      {job.bookingChannel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-border text-muted-foreground text-xs"
                    >
                      {serviceTypeLabels[job.serviceType] || job.serviceType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(job.jobDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.pickUpTime
                      ? new Date(job.pickUpTime).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.bookingChannel === "ONLINE"
                      ? job.agent?.legalName || "\u2014"
                      : job.customer?.legalName || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.clientName || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.clientMobile || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {job.adultCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {job.childCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.originAirport?.code || job.originAirport?.name || job.fromZone?.name || job.originZone?.name || job.originHotel?.name || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.destinationAirport?.code || job.destinationAirport?.name || job.toZone?.name || job.destinationZone?.name || job.destinationHotel?.name || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.flight?.flightNo || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {job.flight?.terminal || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.flight?.arrivalTime
                      ? new Date(job.flight.arrivalTime).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {[
                      job.boosterSeat && `Booster x${job.boosterSeatQty}`,
                      job.babySeat && `Baby x${job.babySeatQty}`,
                      job.wheelChair && `WC x${job.wheelChairQty}`,
                    ].filter(Boolean).join(", ") || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate" title={job.notes || ""}>
                    {job.notes || "\u2014"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusColors[job.status] || ""}`}
                    >
                      {job.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {job.assignment ? (
                      <span>
                        {job.assignment.vehicle?.plateNumber || "\u2014"}
                        {job.assignment.driver &&
                          ` / ${job.assignment.driver.name}`}
                      </span>
                    ) : (
                      t("dispatch.unassigned")
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {job.createdBy?.name || "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </div>
    </div>
  );
}
