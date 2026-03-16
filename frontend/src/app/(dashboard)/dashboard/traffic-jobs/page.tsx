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
  MapPin,
  ExternalLink,
  Image,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { formatDate , localDateStr } from "@/lib/utils";
import { SortableHeader } from "@/components/sortable-header";
import { useSortable } from "@/hooks/use-sortable";

interface TrafficJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  customerJobId: string | null;
  bookingChannel: "ONLINE" | "B2B";
  serviceType: string;
  jobDate: string;
  createdAt: string;
  status: string;
  bookingStatus: string;
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
  printSign: boolean;
  transferPrice: number | null;
  transferPriceCurrency: string;
  collectionRequired: boolean;
  collectionAmount: number | null;
  collectionCurrency: string;
  requestedVehicleType?: { name: string } | null;
  custRepName: string | null;
  custRepMobile: string | null;
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
  flight?: { flightNo: string; carrier?: string; terminal?: string; arrivalTime?: string; departureTime?: string } | null;
  createdBy?: { id: string; name: string } | null;
  assignment?: {
    vehicle?: { plateNumber: string };
    driver?: { name: string };
    rep?: { name: string };
    driverStatus?: string;
    repStatus?: string;
  } | null;
  noShowEvidence?: {
    id: string;
    imageUrls: string[];
    gpsLatitude: number | string;
    gpsLongitude: number | string;
    gpsMapLink: string;
    submittedBy: string;
    createdAt: string;
  }[];
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  ASSIGNED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  COMPLETED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  NO_SHOW: "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30",
};

const bookingStatusColors: Record<string, string> = {
  NEW: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  UPDATED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
};

const portalStatusColors: Record<string, string> = {
  PENDING:     "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  IN_PROGRESS: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  COMPLETED:   "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED:   "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  NO_SHOW:     "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30",
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
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signDate, setSignDate] = useState(localDateStr(new Date()));
  const [evidenceJob, setEvidenceJob] = useState<TrafficJob | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 100;

  const serviceTypeLabels: Record<string, string> = {
    ARR: t("serviceType.ARR"),
    DEP: t("serviceType.DEP"),
    DAY_TOUR: t("serviceType.DAY_TOUR"),
    ONE_WAY_TRANSFER: t("serviceType.ONE_WAY_TRANSFER"),
    TWO_WAY_TRANSFER: t("serviceType.TWO_WAY_TRANSFER"),
  };

  const fetchJobs = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (filterStatus !== "ALL") params.status = filterStatus;
      const { data } = await api.get("/traffic-jobs", { params });
      if (Array.isArray(data)) {
        setJobs(data);
        setTotalPages(1);
        setTotal(data.length);
      } else {
        setJobs(data.data || []);
        setTotalPages(data.meta?.totalPages || 1);
        setTotal(data.meta?.total || 0);
      }
    } catch {
      toast.error(t("jobs.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handlePrintSigns = async () => {
    if (!signDate) {
      toast.error(t("jobs.selectDateForSigns"));
      return;
    }
    setGeneratingSigns(true);
    try {
      const res = await api.get(`/export/odoo/client-signs?date=${signDate}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setSignModalOpen(false);
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
            onClick={() => setSignModalOpen(true)}
          >
            <Printer className="h-4 w-4" />
            {t("jobs.printSigns")}
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
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
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
                <TableHead className="text-white text-xs">{t("jobs.departureTime")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.carrier")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.extras")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.printSign")}</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.notes")}</TableHead>
                <SortableHeader label={t("common.status")} sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label="Bkg Status" sortKey="bookingStatus" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">Driver Status</TableHead>
                <TableHead className="text-white text-xs">Rep Status</TableHead>
                <TableHead className="text-white text-xs">Veh. Type</TableHead>
                <TableHead className="text-white text-xs">Transfer Price</TableHead>
                <TableHead className="text-white text-xs">Collection</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.assignment")}</TableHead>
                <TableHead className="text-white text-xs">Cust. Rep</TableHead>
                <TableHead className="text-white text-xs">{t("jobs.userLog")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((job, idx) => (
                <TableRow
                  key={job.id}
                  className={`border-border cursor-pointer transition-colors hover:bg-primary/10 ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-no-show]")) return;
                    router.push(`/dashboard/traffic-jobs/${job.bookingChannel === "ONLINE" ? "online" : "b2b"}?edit=${job.id}`);
                  }}
                >
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-foreground font-mono text-xs whitespace-nowrap">
                    {job.internalRef}
                    {job.agentRef && (
                      <span className="ml-1 text-muted-foreground">({job.agentRef})</span>
                    )}
                    {job.customerJobId && (
                      <span className="ml-1 text-muted-foreground">#{job.customerJobId}</span>
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
                    {job.flight?.departureTime
                      ? new Date(job.flight.departureTime).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.flight?.carrier || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {[
                      job.boosterSeat && `Booster x${job.boosterSeatQty}`,
                      job.babySeat && `Baby x${job.babySeatQty}`,
                      job.wheelChair && `WC x${job.wheelChairQty}`,
                    ].filter(Boolean).join(", ") || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs text-center">
                    {job.printSign ? (
                      <span className="text-emerald-500">✓</span>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate" title={job.notes || ""}>
                    {job.notes || "\u2014"}
                  </TableCell>
                  <TableCell>
                    {job.status === "NO_SHOW" ? (
                      <Badge
                        data-no-show="true"
                        variant="outline"
                        className={`text-xs cursor-pointer hover:underline ${statusColors[job.status] || ""}`}
                        title="Click to view no-show evidence"
                        onClick={() => setEvidenceJob(job)}
                      >
                        NO SHOW
                        {(job.noShowEvidence?.length ?? 0) > 0 && (
                          <Image className="ml-1 inline h-3 w-3 opacity-70" />
                        )}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[job.status] || ""}`}
                      >
                        {job.status.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${bookingStatusColors[job.bookingStatus] || ""}`}
                    >
                      {job.bookingStatus || "\u2014"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {job.assignment?.driverStatus ? (
                      <Badge
                        variant="outline"
                        data-no-show={job.assignment.driverStatus === "NO_SHOW" ? "true" : undefined}
                        className={`text-xs ${portalStatusColors[job.assignment.driverStatus] || ""} ${job.assignment.driverStatus === "NO_SHOW" ? "cursor-pointer hover:underline" : ""}`}
                        title={job.assignment.driverStatus === "NO_SHOW" ? "Click to view no-show evidence" : undefined}
                        onClick={job.assignment.driverStatus === "NO_SHOW" ? () => setEvidenceJob(job) : undefined}
                      >
                        {job.assignment.driverStatus.replace(/_/g, " ")}
                      </Badge>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell>
                    {job.assignment?.repStatus ? (
                      <Badge
                        variant="outline"
                        data-no-show={job.assignment.repStatus === "NO_SHOW" ? "true" : undefined}
                        className={`text-xs ${portalStatusColors[job.assignment.repStatus] || ""} ${job.assignment.repStatus === "NO_SHOW" ? "cursor-pointer hover:underline" : ""}`}
                        title={job.assignment.repStatus === "NO_SHOW" ? "Click to view no-show evidence" : undefined}
                        onClick={job.assignment.repStatus === "NO_SHOW" ? () => setEvidenceJob(job) : undefined}
                      >
                        {job.assignment.repStatus.replace(/_/g, " ")}
                      </Badge>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.requestedVehicleType?.name || "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.transferPrice
                      ? `${job.transferPrice} ${job.transferPriceCurrency}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {job.collectionRequired && job.collectionAmount
                      ? `${job.collectionAmount} ${job.collectionCurrency}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {job.assignment ? (
                      <span>
                        {job.assignment.vehicle?.plateNumber || "\u2014"}
                        {job.assignment.driver && ` / ${job.assignment.driver.name}`}
                        {job.assignment.rep && ` / ${job.assignment.rep.name}`}
                      </span>
                    ) : (
                      t("dispatch.unassigned")
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {job.custRepName
                      ? `${job.custRepName}${job.custRepMobile ? ` (${job.custRepMobile})` : ""}`
                      : "\u2014"}
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

        {/* Pagination */}
        {!loading && totalPages > 0 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              {t("common.showing") || "Showing"} {filtered.length} of {total} {t("jobs.title")?.toLowerCase() || "jobs"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border-border"
              >
                {t("common.previous") || "Previous"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="border-border"
              >
                {t("common.next") || "Next"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Print Signs Date Modal */}
      <Dialog open={signModalOpen} onOpenChange={setSignModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("jobs.printSigns")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">{t("jobs.selectDateForSigns")}</Label>
              <Input
                type="date"
                value={signDate}
                onChange={(e) => setSignDate(e.target.value)}
                className="border-border bg-card text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSignModalOpen(false)}
              className="border-border"
            >
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              onClick={handlePrintSigns}
              disabled={generatingSigns || !signDate}
              className="gap-1.5"
            >
              {generatingSigns ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {generatingSigns ? t("jobs.generatingSigns") : t("jobs.printSigns")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No-Show Evidence Modal */}
      <Dialog open={!!evidenceJob} onOpenChange={(o) => !o && setEvidenceJob(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              No-Show Evidence — {evidenceJob?.internalRef}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2 max-h-[70vh] overflow-y-auto">
            {(evidenceJob?.noShowEvidence ?? []).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No evidence submitted yet.</p>
            )}
            {(evidenceJob?.noShowEvidence ?? []).map((ev, i) => {
              const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
              return (
              <div key={ev.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Submitted by <span className="text-primary">{ev.submittedBy}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleString(locale, { timeZone: "Africa/Cairo" })}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(ev.imageUrls ?? []).map((url, j) => {
                    const fullUrl = url.startsWith("http") ? url : `${apiBase}${url}`;
                    return (
                      <a key={j} href={fullUrl} target="_blank" rel="noopener noreferrer"
                        className="block overflow-hidden rounded-md border border-border hover:opacity-80 transition-opacity">
                        <img src={fullUrl} alt={`Evidence ${i + 1}-${j + 1}`}
                          className="h-40 w-full object-cover" />
                      </a>
                    );
                  })}
                </div>
                <a
                  href={ev.gpsMapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-400"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  GPS: {Number(ev.gpsLatitude).toFixed(6)}, {Number(ev.gpsLongitude).toFixed(6)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidenceJob(null)} className="border-border">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
