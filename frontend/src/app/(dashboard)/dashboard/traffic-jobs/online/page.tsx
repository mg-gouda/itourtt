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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";

/* ─────────── types ─────────── */

interface Agent {
  id: string;
  legalName: string;
  refPattern?: string | null;
  refExample?: string | null;
}

interface TrafficJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  bookingChannel: "ONLINE" | "B2B";
  serviceType: string;
  jobDate: string;
  status: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName: string | null;
  clientMobile: string | null;
  pickUpTime: string | null;
  notes: string | null;
  agent?: { legalName: string } | null;
  originAirport?: { name: string; code: string } | null;
  originZone?: { name: string } | null;
  originHotel?: { name: string } | null;
  destinationAirport?: { name: string; code: string } | null;
  destinationZone?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  flight?: { flightNo: string } | null;
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

/* ─────────── form state ─────────── */

interface FormState {
  agentId: string;
  agentRef: string;
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
  clientName: string;
  clientMobile: string;
  boosterSeat: boolean;
  boosterSeatQty: string;
  babySeat: boolean;
  babySeatQty: string;
  wheelChair: boolean;
  wheelChairQty: string;
  printSign: boolean;
  pickUpTime: string;
  notes: string;
  flightNo: string;
  terminal: string;
  arrivalTime: string;
  departureTime: string;
}

const defaultForm: FormState = {
  agentId: "",
  agentRef: "",
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
  clientName: "",
  clientMobile: "",
  boosterSeat: false,
  boosterSeatQty: "1",
  babySeat: false,
  babySeatQty: "1",
  wheelChair: false,
  wheelChairQty: "1",
  printSign: false,
  pickUpTime: "",
  notes: "",
  flightNo: "",
  terminal: "",
  arrivalTime: "",
  departureTime: "",
};

/* ─────────── component ─────────── */

export default function OnlineJobPage() {
  const t = useT();
  const locale = useLocaleId();
  const router = useRouter();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<TrafficJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>({ ...defaultForm });

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

  /* ── Fetch agents ── */
  useEffect(() => {
    async function fetchAgents() {
      try {
        const { data } = await api.get("/agents");
        setAgents(Array.isArray(data) ? data : data.data || []);
      } catch {
        /* non-critical */
      }
    }
    fetchAgents();
  }, []);

  /* ── Fetch ONLINE jobs ── */
  const fetchJobs = useCallback(async () => {
    try {
      const params: Record<string, string> = { bookingChannel: "ONLINE" };
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

  /* ── Create job ── */
  const handleCreate = async () => {
    if (!form.agentId) {
      toast.error(t("jobs.agentRequired"));
      return;
    }
    if (!form.agentRef.trim()) {
      toast.error(t("jobs.agentRefRequired"));
      return;
    }
    if (agentRefInvalid) {
      toast.error(`${t("jobs.agentRefInvalid")} ${selectedAgent?.refExample ? `(${selectedAgent.refExample})` : ""}`);
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
        bookingChannel: "ONLINE",
        agentId: form.agentId,
        agentRef: form.agentRef.trim(),
        serviceType: form.serviceType,
        jobDate: form.jobDate,
        adultCount: parseInt(form.adultCount) || 1,
        childCount: parseInt(form.childCount) || 0,
      };

      if (form.originAirportId) payload.originAirportId = form.originAirportId;
      if (form.originZoneId) payload.originZoneId = form.originZoneId;
      if (form.originHotelId) payload.originHotelId = form.originHotelId;
      if (form.destinationAirportId) payload.destinationAirportId = form.destinationAirportId;
      if (form.destinationZoneId) payload.destinationZoneId = form.destinationZoneId;
      if (form.destinationHotelId) payload.destinationHotelId = form.destinationHotelId;

      if (form.clientName.trim()) payload.clientName = form.clientName.trim();
      if (form.clientMobile.trim()) payload.clientMobile = form.clientMobile.trim();
      payload.boosterSeat = form.boosterSeat;
      if (form.boosterSeat) payload.boosterSeatQty = parseInt(form.boosterSeatQty) || 1;
      payload.babySeat = form.babySeat;
      if (form.babySeat) payload.babySeatQty = parseInt(form.babySeatQty) || 1;
      payload.wheelChair = form.wheelChair;
      if (form.wheelChair) payload.wheelChairQty = parseInt(form.wheelChairQty) || 1;
      payload.printSign = form.printSign;

      if (form.pickUpTime) payload.pickUpTime = `${form.jobDate}T${form.pickUpTime}`;
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const showFlight = form.serviceType === "ARR" || form.serviceType === "DEP";
      if (showFlight && (form.flightNo || form.terminal || form.arrivalTime || form.departureTime)) {
        payload.flight = {
          flightNo: form.flightNo || "TBD",
          ...(form.terminal && { terminal: form.terminal }),
          ...(form.arrivalTime && { arrivalTime: `${form.jobDate}T${form.arrivalTime}` }),
          ...(form.departureTime && { departureTime: `${form.jobDate}T${form.departureTime}` }),
        };
      }

      await api.post("/traffic-jobs", payload);
      toast.success(t("jobs.created"));
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
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      j.internalRef?.toLowerCase().includes(q) ||
      j.agentRef?.toLowerCase().includes(q) ||
      j.agent?.legalName?.toLowerCase().includes(q) ||
      j.clientName?.toLowerCase().includes(q)
    );
  });

  const showFlightFields = form.serviceType === "ARR" || form.serviceType === "DEP";
  const selectedAgent = agents.find((a) => a.id === form.agentId);
  const agentRefInvalid = !!(form.agentRef && selectedAgent?.refPattern && (() => { try { return !new RegExp(selectedAgent.refPattern).test(form.agentRef); } catch { return false; } })());

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
          <h1 className="text-2xl font-semibold text-foreground">{t("jobs.newOnlineJob")}</h1>
          <p className="text-sm text-muted-foreground">{t("jobs.onlineDescription")}</p>
        </div>
      </div>

      {/* ─── Inline Form ─── */}
      <Card className="border-border bg-card p-4">
        <div className="space-y-4">
          {/* Line 1: Transfer Provider + Agent Ref + Service Type + Service Date + Pickup Time */}
          <div className="grid grid-cols-5 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.transferProvider")} *</Label>
              <Select value={form.agentId} onValueChange={(v) => updateForm({ agentId: v, agentRef: "" })}>
                <SelectTrigger className="w-full border-border bg-card text-foreground h-9 min-w-0">
                  <SelectValue placeholder={t("jobs.selectAgent")} className="truncate" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.legalName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.agentRef")} *</Label>
              <Input
                value={form.agentRef}
                onChange={(e) => updateForm({ agentRef: e.target.value })}
                placeholder={selectedAgent?.refExample || t("jobs.agentRefPlaceholder")}
                className={cn(
                  "border-border bg-card text-foreground placeholder:text-muted-foreground h-9",
                  agentRefInvalid && "border-red-500 focus-visible:ring-red-500"
                )}
              />
              {agentRefInvalid && (
                <p className="text-[10px] text-red-500">
                  {t("jobs.agentRefInvalid")} {selectedAgent?.refExample && `(${selectedAgent.refExample})`}
                </p>
              )}
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
          </div>

          {/* Line 3: Client Lead Name + Client Mobile + Adults + Children + Print Sign */}
          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.clientName")}</Label>
              <Input
                value={form.clientName}
                onChange={(e) => updateForm({ clientName: e.target.value })}
                placeholder={t("jobs.passengerName")}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.clientMobile")}</Label>
              <Input
                value={form.clientMobile}
                onChange={(e) => updateForm({ clientMobile: e.target.value })}
                placeholder={t("jobs.clientMobilePlaceholder")}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.adults")}</Label>
              <Input
                type="number"
                min="1"
                value={form.adultCount}
                onChange={(e) => updateForm({ adultCount: e.target.value })}
                className="border-border bg-card text-foreground h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t("jobs.children")}</Label>
              <Input
                type="number"
                min="0"
                value={form.childCount}
                onChange={(e) => updateForm({ childCount: e.target.value })}
                className="border-border bg-card text-foreground h-9"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={form.printSign}
                  onCheckedChange={(v) => updateForm({ printSign: v === true })}
                />
                {t("jobs.printSign")}
              </label>
            </div>
          </div>

          {/* Line 3: Origin + Destination + Flight Info */}
          <div className="grid grid-cols-5 gap-3">
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
              </>
            )}
          </div>

          {/* Line 6: Extras */}
          <div className="grid grid-cols-5 gap-3">
            <div className="min-w-0 flex items-center">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={form.boosterSeat}
                  onCheckedChange={(v) => updateForm({ boosterSeat: v === true })}
                />
                {t("jobs.boosterSeat")}
                {form.boosterSeat && (
                  <Input
                    type="number"
                    min="1"
                    value={form.boosterSeatQty}
                    onChange={(e) => updateForm({ boosterSeatQty: e.target.value })}
                    className="border-border bg-card text-foreground h-7 w-14 text-center"
                  />
                )}
              </label>
            </div>
            <div className="min-w-0 flex items-center">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={form.babySeat}
                  onCheckedChange={(v) => updateForm({ babySeat: v === true })}
                />
                {t("jobs.babySeat")}
                {form.babySeat && (
                  <Input
                    type="number"
                    min="1"
                    value={form.babySeatQty}
                    onChange={(e) => updateForm({ babySeatQty: e.target.value })}
                    className="border-border bg-card text-foreground h-7 w-14 text-center"
                  />
                )}
              </label>
            </div>
            <div className="min-w-0 flex items-center">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={form.wheelChair}
                  onCheckedChange={(v) => updateForm({ wheelChair: v === true })}
                />
                {t("jobs.wheelchair")}
                {form.wheelChair && (
                  <Input
                    type="number"
                    min="1"
                    value={form.wheelChairQty}
                    onChange={(e) => updateForm({ wheelChairQty: e.target.value })}
                    className="border-border bg-card text-foreground h-7 w-14 text-center"
                  />
                )}
              </label>
            </div>
          </div>

          {/* Line 7: Notes + Submit */}
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
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 mt-auto"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("jobs.createJob")}
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
          </div>
        </div>

        <Card className="border-border bg-card">
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
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent bg-gray-700/75 dark:bg-gray-800/75">
                  <TableHead className="text-white text-xs">{t("dispatch.ref")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.agentRef")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.type")}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.date")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.transferProvider")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.clientName")}</TableHead>
                  <TableHead className="text-white text-xs">{t("dispatch.route")}</TableHead>
                  <TableHead className="text-white text-xs">{t("dispatch.pax")}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                  <TableHead className="text-white text-xs">{t("jobs.assignment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job, idx) => (
                  <TableRow key={job.id} className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"} hover:bg-accent`}>
                    <TableCell className="text-foreground font-mono text-xs">{job.internalRef}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{job.agentRef || "\u2014"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                        {serviceTypeLabels[job.serviceType] || job.serviceType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(job.jobDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{job.agent?.legalName || "\u2014"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{job.clientName || "\u2014"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {job.originAirport?.code || job.fromZone?.name || job.originZone?.name || job.originHotel?.name || "\u2014"} &rarr; {job.destinationAirport?.code || job.toZone?.name || job.destinationZone?.name || job.destinationHotel?.name || "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {job.paxCount}
                      <span className="ml-1 text-muted-foreground/60">
                        ({job.adultCount}A{job.childCount > 0 && `+${job.childCount}C`})
                      </span>
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
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
