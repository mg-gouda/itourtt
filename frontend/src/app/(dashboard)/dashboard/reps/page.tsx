"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  UserCheck,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  Download,
  KeyRound,
  UserPlus,
  FileDown,
  FileUp,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";
import { TableFilterBar } from "@/components/table-filter-bar";

interface Rep {
  id: string;
  name: string;
  mobileNumber: string;
  feePerFlight: string | number;
  attachmentUrl: string | null;
  userId: string | null;
  user?: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
  isActive: boolean;
}

interface RepsResponse {
  data: Rep[];
  total: number;
  page: number;
  limit: number;
}

export default function RepsPage() {
  const t = useT();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingRep, setEditingRep] = useState<Rep | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    open: boolean;
    imported: number;
    errors: string[];
  }>({ open: false, imported: 0, errors: [] });

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return reps;
    const q = search.toLowerCase();
    return reps.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.mobileNumber && r.mobileNumber.toLowerCase().includes(q))
    );
  }, [reps, search]);

  const { sortedData, sortKey, sortDir, onSort } = useSortable(filtered);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRep, setDeletingRep] = useState<Rep | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Account management
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [accountRepId, setAccountRepId] = useState<string | null>(null);
  const [accountRepName, setAccountRepName] = useState("");
  const [accountRepPhone, setAccountRepPhone] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Form fields
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [feePerFlight, setFeePerFlight] = useState("");

  const fetchReps = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<RepsResponse>("/reps");
      setReps(data.data);
    } catch {
      toast.error(t("drivers.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReps();
  }, [fetchReps]);

  function resetForm() {
    setName("");
    setMobileNumber("");
    setFeePerFlight("");
  }

  function openAddDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(rep: Rep) {
    setEditingRep(rep);
    setName(rep.name);
    setMobileNumber(rep.mobileNumber);
    setFeePerFlight(String(Number(rep.feePerFlight) || ""));
    setEditDialogOpen(true);
  }

  async function handleToggleStatus(id: string) {
    try {
      await api.patch(`/reps/${id}/status`);
      setReps((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  function openDeleteDialog(rep: Rep) {
    setDeletingRep(rep);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingRep) return;
    try {
      setDeleting(true);
      await api.delete(`/reps/${deletingRep.id}`);
      toast.success(t("reps.deleted"));
      setDeleteDialogOpen(false);
      setDeletingRep(null);
      fetchReps();
    } catch {
      toast.error(t("reps.failedDelete"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate() {
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error(t("drivers.nameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/reps", {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        ...(feePerFlight !== "" && { feePerFlight: parseFloat(feePerFlight) }),
      });
      toast.success(t("drivers.created"));
      setDialogOpen(false);
      resetForm();
      fetchReps();
    } catch {
      toast.error(t("drivers.failedCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editingRep) return;
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error(t("drivers.nameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.patch(`/reps/${editingRep.id}`, {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        feePerFlight: feePerFlight !== "" ? parseFloat(feePerFlight) : 0,
      });
      toast.success(t("drivers.updated"));
      setEditDialogOpen(false);
      setEditingRep(null);
      resetForm();
      fetchReps();
    } catch {
      toast.error(t("drivers.failedUpdate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachmentUpload(repId: string, file: File) {
    setUploadingId(repId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ url: string }>(
        `/reps/${repId}/attachment`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setReps((prev) =>
        prev.map((r) =>
          r.id === repId ? { ...r, attachmentUrl: res.data.url } : r
        )
      );
      toast.success(t("drivers.attachmentUploaded"));
    } catch {
      toast.error(t("drivers.failedUpload"));
    } finally {
      setUploadingId(null);
    }
  }

  function triggerFileUpload(repId: string) {
    setUploadingId(repId);
    if (fileInputRef.current) {
      fileInputRef.current.dataset.repId = repId;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const repId = e.target.dataset.repId;
    if (file && repId) {
      handleAttachmentUpload(repId, file);
    } else {
      setUploadingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get("/reps/export/excel", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `reps_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t("reps.exportSuccess"));
    } catch {
      toast.error(t("reps.failedExport"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const res = await api.get("/reps/import/template", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "reps_import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("reps.failedTemplate"));
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/reps/import/excel", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const result = res.data.data;
      setImportResult({
        open: true,
        imported: result.imported,
        errors: result.errors,
      });
      if (result.imported > 0) {
        fetchReps();
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("reps.failedImport");
      toast.error(message);
    } finally {
      setImporting(false);
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
    }
  }

  function openAccountDialog(rep: Rep) {
    setAccountRepId(rep.id);
    setAccountRepName(rep.name);
    setAccountRepPhone(rep.mobileNumber);
    setAccountPassword("");
    setAccountDialogOpen(true);
  }

  function openPasswordDialog(rep: Rep) {
    setAccountRepId(rep.id);
    setAccountRepName(rep.name);
    setNewPassword("");
    setPasswordDialogOpen(true);
  }

  async function handleCreateAccount() {
    if (!accountRepId || !accountPassword.trim()) {
      toast.error(t("drivers.passwordRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/reps/${accountRepId}/account`, {
        password: accountPassword.trim(),
      });
      toast.success(t("drivers.accountCreated"));
      setAccountDialogOpen(false);
      fetchReps();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("drivers.failedAccount");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!accountRepId || !newPassword.trim()) {
      toast.error(t("drivers.passwordRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.patch(`/reps/${accountRepId}/account/password`, {
        password: newPassword.trim(),
      });
      toast.success(t("drivers.passwordReset"));
      setPasswordDialogOpen(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("drivers.failedPassword");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ||
    "http://localhost:3001";

  const repFormFields = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="rep-name" className="text-muted-foreground">
          {t("common.name")} *
        </Label>
        <Input
          id="rep-name"
          placeholder={t("drivers.fullName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rep-mobile" className="text-muted-foreground">
          {t("drivers.mobileNumber")} *
        </Label>
        <Input
          id="rep-mobile"
          placeholder="+20 xxx xxx xxxx"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rep-fee" className="text-muted-foreground">
          {t("reps.feePerFlight")} (EGP)
        </Label>
        <Input
          id="rep-fee"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={feePerFlight}
          onChange={(e) => setFeePerFlight(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t("reps.title")}
          description={t("reps.description")}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleDownloadTemplate}
          >
            <FileDown className="h-4 w-4" />
            {t("common.template")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            {t("common.import")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {t("common.export")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            {t("reps.addRep")}
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelected}
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
      />
      <input
        ref={importFileRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls"
        onChange={handleImportFile}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UserCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {t("reps.noReps")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("reps.addNew")}
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            {t("reps.addRep")}
          </Button>
        </div>
      ) : (
        <>
          <TableFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder={t("common.search") + "..."}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                  <SortableHeader label={t("common.name")} sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableHeader label={t("drivers.mobile")} sortKey="mobileNumber" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableHeader label={t("reps.feePerFlight")} sortKey="feePerFlight" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <TableHead className="text-white text-xs">
                    {t("drivers.attachment")}
                  </TableHead>
                  <TableHead className="text-white text-xs">{t("reps.account")}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                  <TableHead className="text-right text-white text-xs">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((rep, idx) => (
                <TableRow
                  key={rep.id}
                  className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                >
                  <TableCell className="font-medium text-foreground">
                    {rep.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rep.mobileNumber}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {Number(rep.feePerFlight) > 0
                      ? `${Number(rep.feePerFlight).toFixed(2)} EGP`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {rep.attachmentUrl ? (
                      <a
                        href={`${backendUrl}${rep.attachmentUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t("common.view")}
                      </a>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => triggerFileUpload(rep.id)}
                        disabled={uploadingId === rep.id}
                      >
                        {uploadingId === rep.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {t("common.upload")}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {rep.userId ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20">
                          {rep.user?.email ?? "Linked"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => openPasswordDialog(rep)}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {t("common.reset")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => openAccountDialog(rep)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {t("reps.createAccount")}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => handleToggleStatus(rep.id)} className="cursor-pointer">
                      {rep.isActive ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
                          {t("common.active")}
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/25 transition-colors">
                          {t("common.inactive")}
                        </Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditDialog(rep)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-muted-foreground hover:text-red-600"
                      onClick={() => openDeleteDialog(rep)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add Rep Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reps.addRep")}</DialogTitle>
          </DialogHeader>
          {repFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("reps.addRep")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rep Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingRep(null);
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reps.editRep")}</DialogTitle>
          </DialogHeader>
          {repFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Account Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reps.createAccountFor")} {accountRepName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {t("reps.mobileNumber")}
              </Label>
              <Input
                value={accountRepPhone}
                disabled
                className="border-border bg-muted/30 text-foreground"
              />
              <p className="text-xs text-muted-foreground">{t("drivers.loginWithMobile")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-password" className="text-muted-foreground">
                {t("common.password")} *
              </Label>
              <Input
                id="account-password"
                type="password"
                placeholder={t("drivers.minChars")}
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAccountDialogOpen(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateAccount}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("reps.createAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Results Dialog */}
      <Dialog
        open={importResult.open}
        onOpenChange={(open) => {
          if (!open) setImportResult({ open: false, imported: 0, errors: [] });
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("reps.importResults")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {importResult.imported} {t("reps.imported")}
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {importResult.errors.length} {t("reps.errors")}
                  </p>
                )}
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                  Errors
                </p>
                <ul className="space-y-1">
                  {importResult.errors.map((err, i) => (
                    <li
                      key={i}
                      className="text-xs text-destructive flex items-start gap-1.5"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                setImportResult({ open: false, imported: 0, errors: [] })
              }
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) setDeletingRep(null);
      }}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reps.deleteRep")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t("reps.deleteConfirm")} <span className="font-medium text-foreground">{deletingRep?.name}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              {t("reps.deleteNote")}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reps.resetPasswordFor")} {accountRepName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-muted-foreground">
                {t("drivers.newPassword")} *
              </Label>
              <Input
                id="new-password"
                type="password"
                placeholder={t("drivers.minChars")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPasswordDialogOpen(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("reps.resetPassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
