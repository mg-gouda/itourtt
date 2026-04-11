"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

const ALLOWED_EMAILS = ["mggouda@gmail.com", "admin@itour.local"];

const JOB_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
const PORTAL_STATUSES = ["PENDING", "IN_PROGRESS", "IN_PLACE", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

type JobStatus = (typeof JOB_STATUSES)[number];
type PortalStatus = (typeof PORTAL_STATUSES)[number];

const STATUS_COLORS: Record<string, string> = {
  PENDING:     "bg-yellow-100 text-yellow-800",
  ASSIGNED:    "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  IN_PLACE:    "bg-purple-100 text-purple-800",
  COMPLETED:   "bg-green-100 text-green-800",
  CANCELLED:   "bg-red-100 text-red-800",
  NO_SHOW:     "bg-gray-100 text-gray-700",
};

interface Job {
  id: string;
  internalRef: string;
  clientName: string | null;
  status: string;
  serviceType: string;
  jobDate: string;
  assignment?: {
    repStatus: string;
    driverStatus: string;
    rep?: { name: string } | null;
    driver?: { name: string } | null;
  } | null;
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[value] ?? "bg-gray-100 text-gray-700"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export default function JobControlPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  // ── Access guard ──
  useEffect(() => {
    if (user && !ALLOWED_EMAILS.includes(user.email)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);

  // Controlled status values
  const [jobStatus, setJobStatus]       = useState<string>("");
  const [repStatus, setRepStatus]       = useState<string>("");
  const [driverStatus, setDriverStatus] = useState<string>("");
  const [saving, setSaving]             = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.get("/traffic-jobs", {
        params: { search: query.trim(), limit: 20 },
      });
      setResults(data.data ?? data ?? []);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const selectJob = (job: Job) => {
    setSelected(job);
    setJobStatus(job.status);
    setRepStatus(job.assignment?.repStatus ?? "PENDING");
    setDriverStatus(job.assignment?.driverStatus ?? "PENDING");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/traffic-jobs/${selected.id}/control`, {
        jobStatus,
        repStatus,
        driverStatus,
      });
      toast.success("Statuses updated successfully");
      // Refresh the selected job
      const { data } = await api.get(`/traffic-jobs/${selected.id}`);
      const updated = data.data ?? data;
      setSelected(updated);
      setJobStatus(updated.status);
      setRepStatus(updated.assignment?.repStatus ?? "PENDING");
      setDriverStatus(updated.assignment?.driverStatus ?? "PENDING");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Don't render anything until auth is confirmed
  if (!isAuthenticated || !user) return null;
  if (!ALLOWED_EMAILS.includes(user.email)) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Control"
        description="Override job, rep and driver statuses to reflect real-time field changes"
      />

      {/* ── Search ── */}
      <Card className="p-5">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by reference or client name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="pl-9"
            />
          </div>
          <Button onClick={search} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {/* Results list */}
        {results.length > 0 && (
          <div className="mt-4 divide-y rounded-md border">
            {results.map((job) => (
              <button
                key={job.id}
                onClick={() => selectJob(job)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${selected?.id === job.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="font-mono font-medium">{job.internalRef}</span>
                  <span className="text-muted-foreground">{job.clientName ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">{job.serviceType} · {new Date(job.jobDate).toLocaleDateString("en-GB")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={job.status} />
                  {selected?.id === job.id && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Status editor ── */}
      {selected && (
        <Card className="p-5 space-y-6">
          {/* Job info header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-base">{selected.internalRef}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selected.clientName ?? "No client"} &middot; {selected.serviceType} &middot; {new Date(selected.jobDate).toLocaleDateString("en-GB")}
              </p>
              {selected.assignment?.driver && (
                <p className="text-xs text-muted-foreground mt-1">Driver: {selected.assignment.driver.name}</p>
              )}
              {selected.assignment?.rep && (
                <p className="text-xs text-muted-foreground">Rep: {selected.assignment.rep.name}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <StatusBadge value={selected.status} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Job Status */}
            <div className="space-y-2">
              <Label>Job Status</Label>
              <Select value={jobStatus} onValueChange={setJobStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <StatusBadge value={s} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rep Status */}
            <div className="space-y-2">
              <Label>Rep Status</Label>
              <Select
                value={repStatus}
                onValueChange={setRepStatus}
                disabled={!selected.assignment}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <StatusBadge value={s} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selected.assignment && (
                <p className="text-xs text-muted-foreground">No assignment yet</p>
              )}
            </div>

            {/* Driver Status */}
            <div className="space-y-2">
              <Label>Driver Status</Label>
              <Select
                value={driverStatus}
                onValueChange={setDriverStatus}
                disabled={!selected.assignment}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <StatusBadge value={s} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selected.assignment && (
                <p className="text-xs text-muted-foreground">No assignment yet</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="min-w-[120px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
