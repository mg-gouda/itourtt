"use client";

// Quality Control › Guest Surveys — the arrival guest surveys reps submit, by job date, per rep.
// (Moved out of Reports on 2026-11-19; same data and permission `reports.guestSurveys`.)
// Analytics of the same surveys: Quality Control › Guest Analytics.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3, FileSpreadsheet, Loader2, Printer, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatDate, localDateStr } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useCompanyStore } from "@/stores/company-store";
import { downloadBlob, printReport } from "@/lib/print-report";

interface GuestSurveyRow {
  id: string;
  internalRef: string;
  jobDate: string;
  repId: string;
  repName: string;
  ageRange: string;
  noOfAdults: number;
  noOfChildren: number;
  noOfInfants: number;
  flightNo: string;
  stayLength: string | null;
  repeaterGuest: string;
  guestNationality: string;
  localTravelAgent: string | null;
  hotelName: string;
  email: string | null;
  generalComment: string;
  contactNumber: string;
}
interface GuestSurveyReport {
  from: string;
  to: string;
  count: number;
  reps: Array<{ repId: string; repName: string; count: number }>;
  rows: GuestSurveyRow[];
}

export default function GuestSurveysPage() {
  const t = useT();
  const { user } = useAuthStore();
  const { logoUrl, companyName } = useCompanyStore();
  const today = localDateStr(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [repId, setRepId] = useState("ALL");
  const [reps, setReps] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<GuestSurveyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get("/reps", { params: { isActive: true, limit: 1000 } })
      .then(({ data: d }) => {
        const list: Array<{ id: string; name: string }> = Array.isArray(d) ? d : d.data || [];
        setReps(list.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => {});
  }, []);

  const repParam = repId !== "ALL" ? `&repId=${repId}` : "";

  const search = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/reports/guest-surveys?from=${from}&to=${to}${repParam}`);
      setData(d.data || d);
    } catch {
      toast.error("Failed to load guest survey report");
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = () => {
    if (!printRef.current) return;
    if (!printReport({ title: `Guest Surveys - ${from} to ${to}`, html: printRef.current.innerHTML, userName: user?.name, logoUrl, companyName })) {
      toast.error(t("reports.allowPopups"));
    }
  };

  const exportExcel = async () => {
    try {
      const res = await api.get(`/export/odoo/guest-surveys?from=${from}&to=${to}${repParam}`, { responseType: "blob" });
      downloadBlob(res.data, `guest_surveys_${from}_to_${to}.xlsx`);
    } catch {
      toast.error("Failed to export guest surveys to Excel");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Guest Surveys" description="Arrival guest surveys submitted by reps, by job date." />
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/guest-analytics">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            Guest Analytics
          </Link>
        </Button>
      </div>

      <Card className="border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("common.from")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 h-8 w-36 border-border bg-muted/50 text-sm text-foreground" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("common.to")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5 h-8 w-36 border-border bg-muted/50 text-sm text-foreground" />
          </div>
          <div className="min-w-[180px]">
            <Label className="text-xs text-muted-foreground">Rep Name</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger className="mt-0.5 h-8 border-border bg-muted/50 text-sm">
                <SelectValue placeholder="All Reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Reps</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={search} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {t("common.search")}
          </Button>
          {data && data.rows.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={exportPdf} className="ml-auto gap-1.5">
                <Printer className="h-3.5 w-3.5" />
                {t("reports.exportPdf")}
              </Button>
              <Button size="sm" variant="outline" onClick={exportExcel} className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {t("reports.excel")}
              </Button>
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <Card className="border-border bg-card p-4">
          <div ref={printRef}>
            <div className="mb-4 flex flex-wrap gap-4">
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
                <p className="text-xs text-muted-foreground">Total Surveys</p>
                <p className="text-lg font-bold text-foreground">{data.count}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
                <p className="text-xs text-muted-foreground">Reps</p>
                <p className="text-lg font-bold text-foreground">{data.reps.length}</p>
              </div>
            </div>
            {data.reps.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {data.reps.map((r) => (
                  <span key={r.repId} className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground">
                    {r.repName}: <b>{r.count}</b>
                  </span>
                ))}
              </div>
            )}
            {data.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No surveys found for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      {["Date", "Rep", "Job Ref", "Flight", "Hotel", "Nationality", "Age"].map((h) => (
                        <TableHead key={h} className="text-xs">{h}</TableHead>
                      ))}
                      <TableHead className="text-center text-xs">Adt</TableHead>
                      <TableHead className="text-center text-xs">Chd</TableHead>
                      <TableHead className="text-center text-xs">Inf</TableHead>
                      <TableHead className="text-xs">Stay</TableHead>
                      <TableHead className="text-center text-xs">Repeat</TableHead>
                      <TableHead className="text-xs">Local Agent</TableHead>
                      <TableHead className="text-xs">Contact</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Comment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row, idx) => (
                      <TableRow key={row.id} className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(row.jobDate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-medium">{row.repName}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.internalRef}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.flightNo}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.hotelName}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.guestNationality}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.ageRange}</TableCell>
                        <TableCell className="text-center text-xs">{row.noOfAdults}</TableCell>
                        <TableCell className="text-center text-xs">{row.noOfChildren}</TableCell>
                        <TableCell className="text-center text-xs">{row.noOfInfants}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.stayLength || "—"}</TableCell>
                        <TableCell className="text-center text-xs">{row.repeaterGuest}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.localTravelAgent || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.contactNumber}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.email || "—"}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs" title={row.generalComment}>{row.generalComment}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">Select a date range and search to view guest surveys.</p>
      )}
    </div>
  );
}
