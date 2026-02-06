"use client";

import { useState, useCallback } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plane,
  MapPin,
  Users,
  Search,
  History,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

interface HistoryJob {
  id: string;
  internalRef: string;
  serviceType: string;
  jobDate: string;
  status: string;
  paxCount: number;
  feeEarned: number | null;
  fromZone?: { name: string };
  toZone?: { name: string };
  flight?: {
    flightNo: string;
    carrier: string;
    terminal: string | null;
    arrivalTime: string | null;
    departureTime: string | null;
  };
  agent?: { legalName: string };
  customer?: { legalName: string };
  assignment?: {
    vehicle?: { plateNumber: string; vehicleType?: { name: string } };
    driver?: { name: string; mobileNumber: string };
  };
}

const SERVICE_TYPE_COLORS: Record<string, string> = {
  ARR: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DEP: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  EXCURSION: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-500/10 text-green-400 border-green-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
  NO_SHOW: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function RepHistoryPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await api.get("/rep-portal/jobs/history", {
        params: { date },
      });
      setJobs(data.data?.jobs ?? []);
    } catch {
      toast.error("Failed to load job history");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const totalFees = jobs.reduce((sum, j) => sum + (j.feeEarned ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          <History className="mr-2 inline h-6 w-6" />
          Job History
        </h1>
        <p className="text-sm text-muted-foreground">
          View past completed and closed jobs
        </p>
      </div>

      {/* Date picker & search */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-48 pl-9"
          />
        </div>
        <Button onClick={fetchHistory} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-4 w-4" />
          )}
          Search
        </Button>
      </div>

      {/* Results */}
      {!searched ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Select a date and click Search to view history
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No completed jobs found for this date
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Flight</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="text-center">Pax</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Fee (EGP)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-xs">
                          {job.internalRef}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={SERVICE_TYPE_COLORS[job.serviceType] || ""}
                          >
                            {job.serviceType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {job.flight ? (
                            <span className="flex items-center gap-1">
                              <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                              {job.flight.carrier} {job.flight.flightNo}
                              <span className="text-muted-foreground">
                                {job.serviceType === "ARR"
                                  ? formatTime(job.flight.arrivalTime)
                                  : formatTime(job.flight.departureTime)}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {job.fromZone?.name ?? "—"} &rarr;{" "}
                            {job.toZone?.name ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {job.paxCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={STATUS_COLORS[job.status] || ""}
                          >
                            {job.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {job.feeEarned != null
                            ? job.feeEarned.toLocaleString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total row */}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell colSpan={6} className="text-right">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {totalFees.toLocaleString()} EGP
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">
                      {job.internalRef}
                    </span>
                    <div className="flex gap-1.5">
                      <Badge
                        variant="outline"
                        className={SERVICE_TYPE_COLORS[job.serviceType] || ""}
                      >
                        {job.serviceType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[job.status] || ""}
                      >
                        {job.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                  {job.flight && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Plane className="h-3.5 w-3.5" />
                      {job.flight.carrier} {job.flight.flightNo}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {job.fromZone?.name ?? "—"} &rarr; {job.toZone?.name ?? "—"}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {job.paxCount} pax
                    </span>
                    {job.feeEarned != null && (
                      <span className="font-mono font-semibold text-green-400">
                        {job.feeEarned.toLocaleString()} EGP
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Mobile total */}
            <Card className="border-primary/30">
              <CardContent className="flex items-center justify-between p-4">
                <span className="font-semibold text-foreground">Total Fees</span>
                <span className="font-mono text-lg font-bold text-green-400">
                  {totalFees.toLocaleString()} EGP
                </span>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
