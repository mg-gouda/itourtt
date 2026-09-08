"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Search,
  AlertTriangle,
  Clock,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";
import { PermissionGate } from "@/components/permission-gate";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { ColumnVisibilityControl } from "@/components/ui/column-visibility-control";
import { type ColumnDef } from "@/components/ui/draggable-table-header";
import { APP_TZ } from "@/lib/utils";
import {
  type Complaint,
  type ComplaintCategory,
  COMPLAINT_STATUS_META,
  STAGE_LABELS,
  PARTY_LABELS,
  SOURCE_LABELS,
  formatSlaCountdown,
  formatMoney,
} from "@/lib/complaints";
import { ComplaintFormDialog } from "@/components/complaints/complaint-form-dialog";
import { ComplaintDetailDialog } from "@/components/complaints/complaint-detail-dialog";

const COL_DEFS: ColumnDef[] = [
  { key: "complaintNo", label: "Complaint #" },
  { key: "job", label: "Job" },
  { key: "agent", label: "Agent" },
  { key: "category", label: "Category" },
  { key: "stage", label: "Stage" },
  { key: "complaintDate", label: "Received" },
  { key: "sla", label: "Reply SLA" },
  { key: "responsible", label: "Responsible" },
  { key: "loss", label: "Loss" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions" },
];

const LIMIT = 20;

export default function ComplaintsPage() {
  const t = useT();

  const canAdd = usePermission("complaints.addButton");
  const canEdit = usePermission("complaints.editButton");
  const canDelete = usePermission("complaints.deleteButton");
  const canViewAmounts = usePermission("complaints.financial.viewAmounts");

  const { visibility: colVis, saveVisibility: saveColVis } = useColumnPreferences(
    "complaints",
    COL_DEFS.map((c) => c.key),
  );
  const isVis = (key: string) => colVis[key] !== false;
  const visColCount = COL_DEFS.filter((c) => colVis[c.key] !== false).length;

  const [rows, setRows] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (partyFilter !== "all") params.set("responsibleParty", partyFilter);
      if (categoryFilter !== "all") params.set("categoryId", categoryFilter);
      if (slaFilter === "breached") params.set("slaBreached", "true");
      if (slaFilter === "open") params.set("openOnly", "true");
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) params.set("dateTo", new Date(`${dateTo}T23:59:59`).toISOString());

      const res = await api.get(`/complaints?${params.toString()}`);
      setRows(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch {
      toast.error(t("complaints.loadFailed") || "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    search,
    statusFilter,
    stageFilter,
    partyFilter,
    categoryFilter,
    slaFilter,
    dateFrom,
    dateTo,
    t,
  ]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get("/complaint-categories");
      setCategories(res.data.data || []);
    } catch {
      // The list still works without the category filter; the form reports its own error.
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleDelete = async (row: Complaint) => {
    if (
      !window.confirm(
        t("complaints.confirmDelete") ||
          `Delete complaint ${row.complaintNo}? This can't be undone from the UI.`,
      )
    ) {
      return;
    }
    setDeleting(row.id);
    try {
      await api.delete(`/complaints/${row.id}`);
      toast.success(t("complaints.deleted") || "Complaint deleted");
      await fetchComplaints();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete complaint");
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const breachedCount = rows.filter((r) => r.slaBreached).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("complaints.title") || "Complaints"}
        description={
          t("complaints.description") ||
          "Client complaints raised against a job, the 48-hour reply window, and the outcome with the agent"
        }
        action={
          canAdd
            ? {
                label: t("complaints.logComplaint") || "Log Complaint",
                onClick: () => {
                  setEditing(null);
                  setFormOpen(true);
                },
              }
            : undefined
        }
      />

      {breachedCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {breachedCount} complaint{breachedCount === 1 ? "" : "s"} on this page missed the
            reply deadline.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              t("complaints.searchPlaceholder") || "Search by complaint #, subject, job ref…"
            }
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(COMPLAINT_STATUS_META).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={slaFilter}
          onValueChange={(v) => {
            setSlaFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Reply SLA" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="breached">SLA breached</SelectItem>
            <SelectItem value="open">Still open</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={stageFilter}
          onValueChange={(v) => {
            setStageFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={partyFilter}
          onValueChange={(v) => {
            setPartyFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Responsible" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Responsible</SelectItem>
            {Object.entries(PARTY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="w-[150px]"
          aria-label="Received from"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="w-[150px]"
          aria-label="Received to"
        />

        <ColumnVisibilityControl
          columns={COL_DEFS}
          visibility={colVis}
          onSave={saveColVis}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isVis("complaintNo") && <TableHead>Complaint #</TableHead>}
              {isVis("job") && <TableHead>Job</TableHead>}
              {isVis("agent") && <TableHead>Agent</TableHead>}
              {isVis("category") && <TableHead>Category</TableHead>}
              {isVis("stage") && <TableHead>Stage</TableHead>}
              {isVis("complaintDate") && <TableHead>Received</TableHead>}
              {isVis("sla") && <TableHead>Reply SLA</TableHead>}
              {isVis("responsible") && <TableHead>Responsible</TableHead>}
              {isVis("loss") && canViewAmounts && <TableHead>Loss</TableHead>}
              {isVis("status") && <TableHead>Status</TableHead>}
              {isVis("actions") && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visColCount} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visColCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  No complaints found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const sla = formatSlaCountdown(row);
                const statusMeta = COMPLAINT_STATUS_META[row.status];
                return (
                  <TableRow key={row.id} className={row.slaBreached ? "bg-destructive/5" : ""}>
                    {isVis("complaintNo") && (
                      <TableCell className="font-medium">{row.complaintNo}</TableCell>
                    )}
                    {isVis("job") && (
                      <TableCell>
                        <div className="text-sm">{row.trafficJob?.internalRef ?? "—"}</div>
                        {row.trafficJob?.agentRef && (
                          <div className="text-xs text-muted-foreground">
                            {row.trafficJob.agentRef}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {isVis("agent") && (
                      <TableCell className="text-sm">
                        {row.agent?.tradeName || row.agent?.legalName || "—"}
                      </TableCell>
                    )}
                    {isVis("category") && (
                      <TableCell className="text-sm">{row.category?.nameEn ?? "—"}</TableCell>
                    )}
                    {isVis("stage") && (
                      <TableCell className="text-sm">
                        {STAGE_LABELS[row.stage] ?? row.stage}
                      </TableCell>
                    )}
                    {isVis("complaintDate") && (
                      <TableCell className="text-sm">
                        {new Date(row.complaintDate).toLocaleDateString("en-GB", {
                          timeZone: APP_TZ,
                        })}
                      </TableCell>
                    )}
                    {isVis("sla") && (
                      <TableCell>
                        <Badge
                          variant={sla.tone === "danger" ? "destructive" : "outline"}
                          className={
                            sla.tone === "warning"
                              ? "border-amber-500 text-amber-600"
                              : sla.tone === "ok"
                                ? "border-emerald-500 text-emerald-600"
                                : undefined
                          }
                        >
                          {sla.tone === "warning" && <Clock className="mr-1 h-3 w-3" />}
                          {sla.label}
                        </Badge>
                      </TableCell>
                    )}
                    {isVis("responsible") && (
                      <TableCell className="text-sm">
                        {row.responsibleParty
                          ? PARTY_LABELS[row.responsibleParty] ?? row.responsibleParty
                          : "—"}
                        {(row.responsibleDriver || row.responsibleRep) && (
                          <div className="text-xs text-muted-foreground">
                            {row.responsibleDriver?.name ?? row.responsibleRep?.name}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {isVis("loss") && canViewAmounts && (
                      <TableCell className="text-sm">
                        {row.lossAmount != null
                          ? formatMoney(row.lossAmount, row.currency)
                          : "—"}
                      </TableCell>
                    )}
                    {isVis("status") && (
                      <TableCell>
                        <Badge variant={statusMeta?.variant ?? "outline"}>
                          {statusMeta?.label ?? row.status}
                        </Badge>
                      </TableCell>
                    )}
                    {isVis("actions") && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailId(row.id)}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <PermissionGate permission="complaints.editButton" mode="hide">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(row);
                                setFormOpen(true);
                              }}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="complaints.deleteButton" mode="hide">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(row)}
                              disabled={deleting === row.id}
                              title="Delete"
                            >
                              {deleting === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          </PermissionGate>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ComplaintFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        complaint={editing}
        categories={categories}
        onSaved={fetchComplaints}
      />

      <ComplaintDetailDialog
        complaintId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        onChanged={fetchComplaints}
      />
    </div>
  );
}
