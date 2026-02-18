"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Loader2,
  Search,
  Filter,
  ArrowLeft,
  Save,
  Lock,
  X,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { LocationCombobox } from "@/components/location-combobox";
import { B2BJobImportModal } from "@/components/b2b-job-import-modal";
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";

/* ─────────── types ─────────── */

interface Customer {
  id: string;
  legalName: string;
  tradeName: string | null;
}

interface TrafficJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  bookingChannel: "ONLINE" | "B2B";
  serviceType: string;
  jobDate: string;
  status: string;
  bookingStatus: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName: string | null;
  pickUpTime: string | null;
  notes: string | null;
  boosterSeat: boolean;
  boosterSeatQty: number;
  babySeat: boolean;
  babySeatQty: number;
  wheelChair: boolean;
  wheelChairQty: number;
  createdAt: string;
  customerId: string | null;
  originAirportId: string | null;
  originZoneId: string | null;
  originHotelId: string | null;
  destinationAirportId: string | null;
  destinationZoneId: string | null;
  destinationHotelId: string | null;
  custRepName: string | null;
  custRepMobile: string | null;
  custRepMeetingPoint: string | null;
  custRepMeetingTime: string | null;
  customer?: { legalName: string } | null;
  originAirport?: { name: string; code: string } | null;
  originZone?: { name: string } | null;
  originHotel?: { name: string } | null;
  destinationAirport?: { name: string; code: string } | null;
  destinationZone?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  flight?: { flightNo: string; terminal?: string; arrivalTime?: string; departureTime?: string } | null;
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

const bookingStatusColors: Record<string, string> = {
  NEW: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  UPDATED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
};

function isJobLocked(createdAt: string): boolean {
  const created = new Date(createdAt);
  const oneWeekLater = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
  return new Date() > oneWeekLater;
}

/* ─────────── form state ─────────── */

interface FormState {
  bookingStatus: string;
  customerId: string;
  serviceType: string;
  jobDate: string;
  adultCount: string;
  childCount: string;
  originAirportId: string;
  originZoneId: string;
  originHotelId: string;
  destinationAirportId: string;
  destinationZoneId: string;
  destinationHotelId: string;
  originSelectedId: string;
  destinationSelectedId: string;
  pickUpTime: string;
  notes: string;
  custRepName: string;
  custRepMobile: string;
  custRepMeetingPoint: string;
  custRepMeetingTime: string;
  flightNo: string;
  terminal: string;
  arrivalTime: string;
  departureTime: string;
}

const defaultForm: FormState = {
  bookingStatus: "NEW",
  customerId: "",
  serviceType: "ARR",
  jobDate: new Date().toISOString().split("T")[0],
  adultCount: "1",
  childCount: "0",
  originAirportId: "",
  originZoneId: "",
  originHotelId: "",
  destinationAirportId: "",
  destinationZoneId: "",
  destinationHotelId: "",
  originSelectedId: "",
  destinationSelectedId: "",
  pickUpTime: "",
  notes: "",
  custRepName: "",
  custRepMobile: "",
  custRepMeetingPoint: "",
  custRepMeetingTime: "",
  flightNo: "",
  terminal: "",
  arrivalTime: "",
  departureTime: "",
};

/* ─────────── component ─────────── */

export default function B2BJobPage() {
  const t = useT();
  const locale = useLocaleId();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<TrafficJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterBookingStatus, setFilterBookingStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>({ ...defaultForm });
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

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

  const updateForm = useCallback((updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  /* ── Fetch customers ── */
  useEffect(() => {
    async function fetchCustomers() {
      try {
        const { data } = await api.get("/customers");
        setCustomers(Array.isArray(data) ? data : data.data || []);
      } catch {
        /* non-critical */
      }
    }
    fetchCustomers();
  }, []);

  /* ── Fetch B2B jobs ── */
  const fetchJobs = useCallback(async () => {
    try {
      const params: Record<string, string> = { bookingChannel: "B2B" };
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

  /* ── Select job for editing ── */
  const handleSelectJob = (job: TrafficJob) => {
    if (isJobLocked(job.createdAt)) return;

    setEditingJobId(job.id);

    const originSelectedId = job.originAirportId || job.originZoneId || job.originHotelId || "";
    const destinationSelectedId = job.destinationAirportId || job.destinationZoneId || job.destinationHotelId || "";

    const pickUpTime = job.pickUpTime ? new Date(job.pickUpTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    const arrivalTime = job.flight?.arrivalTime ? new Date(job.flight.arrivalTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    const departureTime = job.flight?.departureTime ? new Date(job.flight.departureTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    const custRepMeetingTime = job.custRepMeetingTime ? new Date(job.custRepMeetingTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";

    setForm({
      bookingStatus: "UPDATED",
      customerId: job.customerId || "",
      serviceType: job.serviceType,
      jobDate: job.jobDate?.split("T")[0] || "",
      adultCount: String(job.adultCount),
      childCount: String(job.childCount),
      originAirportId: job.originAirportId || "",
      originZoneId: job.originZoneId || "",
      originHotelId: job.originHotelId || "",
      destinationAirportId: job.destinationAirportId || "",
      destinationZoneId: job.destinationZoneId || "",
      destinationHotelId: job.destinationHotelId || "",
      originSelectedId,
      destinationSelectedId,
      pickUpTime,
      notes: job.notes || "",
      custRepName: job.custRepName || "",
      custRepMobile: job.custRepMobile || "",
      custRepMeetingPoint: job.custRepMeetingPoint || "",
      custRepMeetingTime,
      flightNo: job.flight?.flightNo || "",
      terminal: job.flight?.terminal || "",
      arrivalTime,
      departureTime,
    });
  };

  const handleCancelEdit = () => {
    setEditingJobId(null);
    setForm({ ...defaultForm });
  };

  /* ── Create or Update job ── */
  const handleSave = async () => {
    if (!form.customerId) {
      toast.error(t("jobs.customerRequired"));
      return;
    }

    const hasOrigin = form.originAirportId || form.originZoneId || form.originHotelId;
    const hasDest = form.destinationAirportId || form.destinationZoneId || form.destinationHotelId;
    if (!hasOrigin || !hasDest) {
      toast.error(t("jobs.originDestRequired"));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        bookingChannel: "B2B",
        customerId: form.customerId,
        serviceType: form.serviceType,
        jobDate: form.jobDate,
        adultCount: parseInt(form.adultCount) || 1,
        childCount: parseInt(form.childCount) || 0,
        bookingStatus: form.bookingStatus,
      };

      if (form.originAirportId) payload.originAirportId = form.originAirportId;
      if (form.originZoneId) payload.originZoneId = form.originZoneId;
      if (form.originHotelId) payload.originHotelId = form.originHotelId;
      if (form.destinationAirportId) payload.destinationAirportId = form.destinationAirportId;
      if (form.destinationZoneId) payload.destinationZoneId = form.destinationZoneId;
      if (form.destinationHotelId) payload.destinationHotelId = form.destinationHotelId;

      if (form.pickUpTime) payload.pickUpTime = `${form.jobDate}T${form.pickUpTime}`;
      if (form.notes.trim()) payload.notes = form.notes.trim();
      if (form.custRepName.trim()) payload.custRepName = form.custRepName.trim();
      if (form.custRepMobile.trim()) payload.custRepMobile = form.custRepMobile.trim();
      if (form.custRepMeetingPoint.trim()) payload.custRepMeetingPoint = form.custRepMeetingPoint.trim();
      if (form.custRepMeetingTime) payload.custRepMeetingTime = `${form.jobDate}T${form.custRepMeetingTime}`;

      const showFlight = form.serviceType === "ARR" || form.serviceType === "DEP";
      if (showFlight && (form.flightNo || form.terminal || form.arrivalTime || form.departureTime)) {
        payload.flight = {
          flightNo: form.flightNo || "TBD",
          ...(form.terminal && { terminal: form.terminal }),
          ...(form.arrivalTime && { arrivalTime: `${form.jobDate}T${form.arrivalTime}` }),
          ...(form.departureTime && { departureTime: `${form.jobDate}T${form.departureTime}` }),
        };
      }

      if (editingJobId) {
        const { bookingChannel, bookingStatus, ...updatePayload } = payload;
        await api.patch(`/traffic-jobs/${editingJobId}`, updatePayload);
        toast.success(t("jobs.updated") || "Job updated successfully");
      } else {
        const { bookingStatus, ...createPayload } = payload;
        await api.post("/traffic-jobs", createPayload);
        toast.success(t("jobs.created"));
      }

      setEditingJobId(null);
      setForm({ ...defaultForm });
      fetchJobs();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message || t("jobs.failedCreate")
          : t("jobs.failedCreate");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = jobs.filter((j) => {
    if (filterBookingStatus !== "ALL" && j.bookingStatus !== filterBookingStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      j.internalRef?.toLowerCase().includes(q) ||
      j.customer?.legalName?.toLowerCase().includes(q) ||
      j.clientName?.toLowerCase().includes(q)
    );
  });

  const showFlightFields = form.serviceType === "ARR" || form.serviceType === "DEP";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/traffic-jobs")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {editingJobId ? (t("jobs.editJob") || "Edit Job") : t("jobs.newB2BJob")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("jobs.b2bDescription")}</p>
        </div>
      </div>

      {/* ─── Inline Form ─── */}
      <Card className={cn("border-border bg-card p-4", editingJobId && "ring-2 ring-primary/50")}>
        <div className="space-y-4">
          {/* Row 1: Booking Status + Customer + Service Type + Date + Pickup + Adults */}
          <div className="grid grid-cols-6 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.bookingStatus") || "Booking Status"}</Label>
              <Select value={form.bookingStatus} onValueChange={(v) => updateForm({ bookingStatus: v })}>
                <SelectTrigger className="w-full border-border bg-card text-foreground h-9 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {!editingJobId && <SelectItem value="NEW">{t("jobs.bookingNew") || "New"}</SelectItem>}
                  <SelectItem value="UPDATED">{t("jobs.bookingUpdated") || "Updated"}</SelectItem>
                  <SelectItem value="CANCELLED">{t("jobs.bookingCancelled") || "Cancelled"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.customer")} *</Label>
              <Select value={form.customerId} onValueChange={(v) => updateForm({ customerId: v })}>
                <SelectTrigger className="w-full border-border bg-card text-foreground h-9 min-w-0">
                  <SelectValue placeholder={t("jobs.selectCustomer")} className="truncate" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.legalName}
                      {c.tradeName && <span className="ml-1 text-muted-foreground">({c.tradeName})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.serviceType")}</Label>
              <Select value={form.serviceType} onValueChange={(v) => updateForm({ serviceType: v })}>
                <SelectTrigger className="w-full border-border bg-card text-foreground h-9 min-w-0">
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {Object.entries(serviceTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.serviceDate")}</Label>
              <Input
                type="date"
                value={form.jobDate}
                onChange={(e) => updateForm({ jobDate: e.target.value })}
                className="border-border bg-card text-foreground h-9"
              />
            </div>
            {form.serviceType !== "ARR" && (
              <div className="min-w-0 space-y-1.5">
                <Label className="text-muted-foreground text-xs">{t("jobs.pickUpTime")}</Label>
                <Input
                  value={form.pickUpTime}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9:]/g, "");
                    if (v.length === 2 && !v.includes(":") && form.pickUpTime.length < v.length) v += ":";
                    if (v.length > 5) v = v.slice(0, 5);
                    updateForm({ pickUpTime: v });
                  }}
                  placeholder="HH:MM"
                  maxLength={5}
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9 font-mono"
                />
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.adults")}</Label>
              <Input
                type="number"
                min="1"
                value={form.adultCount}
                onChange={(e) => updateForm({ adultCount: e.target.value })}
                className="border-border bg-card text-foreground h-9"
              />
            </div>
          </div>

          {/* Row 2: Children + Origin + Destination + Flight Info (inline when ARR/DEP) */}
          <div className="grid grid-cols-5 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.children")}</Label>
              <Input
                type="number"
                min="0"
                value={form.childCount}
                onChange={(e) => updateForm({ childCount: e.target.value })}
                className="border-border bg-card text-foreground h-9"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.origin")}</Label>
              <LocationCombobox
                value={form.originSelectedId}
                onChange={(id, type) => {
                  const clear = { originAirportId: "", originZoneId: "", originHotelId: "", originSelectedId: id };
                  if (type === "AIRPORT") updateForm({ ...clear, originAirportId: id });
                  else if (type === "ZONE") updateForm({ ...clear, originZoneId: id });
                  else if (type === "HOTEL") updateForm({ ...clear, originHotelId: id });
                }}
                placeholder={t("jobs.searchOrigin")}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.destination")}</Label>
              <LocationCombobox
                value={form.destinationSelectedId}
                onChange={(id, type) => {
                  const clear = { destinationAirportId: "", destinationZoneId: "", destinationHotelId: "", destinationSelectedId: id };
                  if (type === "AIRPORT") updateForm({ ...clear, destinationAirportId: id });
                  else if (type === "ZONE") updateForm({ ...clear, destinationZoneId: id });
                  else if (type === "HOTEL") updateForm({ ...clear, destinationHotelId: id });
                }}
                placeholder={t("jobs.searchDestination")}
              />
            </div>
            {showFlightFields && (
              <>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t("jobs.flightNo")}</Label>
                  <Input
                    value={form.flightNo}
                    onChange={(e) => updateForm({ flightNo: e.target.value })}
                    placeholder="e.g. MS800"
                    className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t("jobs.terminal")}</Label>
                  <Input
                    value={form.terminal}
                    onChange={(e) => updateForm({ terminal: e.target.value })}
                    placeholder="e.g. T2"
                    className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
                  />
                </div>
              </>
            )}
          </div>

          {/* Row 3: Arrival/Departure Time (only when ARR/DEP) */}
          {showFlightFields && (
            <div className="grid grid-cols-5 gap-3">
              {form.serviceType === "ARR" && (
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t("jobs.arrivalTime")}</Label>
                  <Input
                    value={form.arrivalTime}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9:]/g, "");
                      if (v.length === 2 && !v.includes(":") && form.arrivalTime.length < v.length) v += ":";
                      if (v.length > 5) v = v.slice(0, 5);
                      updateForm({ arrivalTime: v });
                    }}
                    placeholder="HH:MM"
                    maxLength={5}
                    className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9 font-mono"
                  />
                </div>
              )}
              {form.serviceType === "DEP" && (
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t("jobs.departureTime")}</Label>
                  <Input
                    value={form.departureTime}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9:]/g, "");
                      if (v.length === 2 && !v.includes(":") && form.departureTime.length < v.length) v += ":";
                      if (v.length > 5) v = v.slice(0, 5);
                      updateForm({ departureTime: v });
                    }}
                    placeholder="HH:MM"
                    maxLength={5}
                    className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9 font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 4: Customer Rep Meeting Fields */}
          <div className="grid grid-cols-5 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.custRepName")}</Label>
              <Input
                value={form.custRepName}
                onChange={(e) => updateForm({ custRepName: e.target.value })}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.custRepMobile")}</Label>
              <Input
                type="tel"
                value={form.custRepMobile}
                onChange={(e) => updateForm({ custRepMobile: e.target.value })}
                placeholder="+20 xxx xxx xxxx"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.custRepMeetingPoint")}</Label>
              <Input
                value={form.custRepMeetingPoint}
                onChange={(e) => updateForm({ custRepMeetingPoint: e.target.value })}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.custRepMeetingTime")}</Label>
              <Input
                value={form.custRepMeetingTime}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9:]/g, "");
                  if (v.length === 2 && !v.includes(":") && form.custRepMeetingTime.length < v.length) v += ":";
                  if (v.length > 5) v = v.slice(0, 5);
                  updateForm({ custRepMeetingTime: v });
                }}
                placeholder="HH:MM"
                maxLength={5}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9 font-mono"
              />
            </div>
          </div>

          {/* Row 5: Notes + Submit */}
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder={t("jobs.optionalNotes")}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            {editingJobId && (
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                className="gap-1.5 mt-auto border-border text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                {t("common.cancel") || "Cancel"}
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 mt-auto"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingJobId ? (t("jobs.updateJob") || "Update Job") : t("jobs.createJob")}
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Jobs Grid ─── */}
      <div className="space-y-3">
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
            <Select value={filterBookingStatus} onValueChange={setFilterBookingStatus}>
              <SelectTrigger className="w-36 border-border bg-card text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover text-foreground">
                <SelectItem value="ALL">{t("jobs.allBooking") || "All Booking"}</SelectItem>
                <SelectItem value="NEW">{t("jobs.bookingNew") || "New"}</SelectItem>
                <SelectItem value="UPDATED">{t("jobs.bookingUpdated") || "Updated"}</SelectItem>
                <SelectItem value="CANCELLED">{t("jobs.bookingCancelled") || "Cancelled"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            className="gap-1.5 border-border ml-auto"
            onClick={() => setImportModalOpen(true)}
          >
            <Upload className="h-4 w-4" />
            {t("jobImport.title") || "Import Jobs"}
          </Button>
        </div>

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
                  <TableHead className="text-white text-xs w-8"></TableHead>
                  <TableHead className="text-white text-xs">{t("dispatch.ref")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.type")}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.date")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.customer")}</TableHead>
                  <TableHead className="text-white text-xs">{t("dispatch.route")}</TableHead>
                  <TableHead className="text-white text-xs">{t("dispatch.pax")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.extras") || "Extras"}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.notes") || "Notes"}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.bookingStatus") || "Booking"}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.assignment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job, idx) => {
                  const locked = isJobLocked(job.createdAt);
                  const isSelected = editingJobId === job.id;
                  return (
                    <TableRow
                      key={job.id}
                      onClick={() => !locked && handleSelectJob(job)}
                      className={cn(
                        "border-border",
                        locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-primary/10",
                        isSelected
                          ? "bg-primary/20 dark:bg-primary/20"
                          : idx % 2 === 0
                            ? "bg-gray-100/25 dark:bg-gray-800/25"
                            : "bg-gray-200/50 dark:bg-gray-700/50"
                      )}
                    >
                      <TableCell className="text-center px-2">
                        {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />}
                      </TableCell>
                      <TableCell className="text-foreground font-mono text-xs">{job.internalRef}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                          {serviceTypeLabels[job.serviceType] || job.serviceType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(job.jobDate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{job.customer?.legalName || "\u2014"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {job.originAirport?.code || job.fromZone?.name || job.originZone?.name || job.originHotel?.name || "\u2014"} &rarr; {job.destinationAirport?.code || job.toZone?.name || job.destinationZone?.name || job.destinationHotel?.name || "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {job.paxCount}
                        <span className="ml-1 text-muted-foreground/60">
                          ({job.adultCount}A{job.childCount > 0 && `+${job.childCount}C`})
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {(() => {
                          const extras: string[] = [];
                          if (job.boosterSeatQty > 0) extras.push(`B:${job.boosterSeatQty}`);
                          if (job.babySeatQty > 0) extras.push(`I:${job.babySeatQty}`);
                          if (job.wheelChairQty > 0) extras.push(`W:${job.wheelChairQty}`);
                          return extras.length > 0 ? extras.join(" ") : "\u2014";
                        })()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate" title={job.notes || ""}>
                        {job.notes || "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${bookingStatusColors[job.bookingStatus] || ""}`}>
                          {job.bookingStatus || "NEW"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColors[job.status] || ""}`}>
                          {job.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.assignment ? (
                          <span>
                            {job.assignment.vehicle?.plateNumber || "\u2014"}
                            {job.assignment.driver && ` / ${job.assignment.driver.name}`}
                          </span>
                        ) : (
                          t("dispatch.unassigned")
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
      </div>

      <B2BJobImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        customers={customers}
        onImportComplete={fetchJobs}
      />
    </div>
  );
}
