"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Users,
  Plus,
  Loader2,
  Pencil,
  Upload,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  FileDown,
  FileUp,
  UserPlus,
  KeyRound,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";
import { TableFilterBar } from "@/components/table-filter-bar";
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
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate as utilsFormatDate } from "@/lib/utils";

interface Driver {
  id: string;
  name: string;
  mobileNumber: string;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  attachmentUrl: string | null;
  userId: string | null;
  user?: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
  isActive: boolean;
}

interface DriversResponse {
  data: Driver[];
  total: number;
  page: number;
  limit: number;
}

function getExpiryStatus(dateStr: string | null): "expired" | "expiring" | "ok" | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  expiry.setHours(0, 0, 0, 0);
  if (expiry < today) return "expired";
  const thirtyDays = new Date(today);
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  if (expiry <= thirtyDays) return "expiring";
  return "ok";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return utilsFormatDate(dateStr);
}

export default function DriversPage() {
  const t = useT();
  const locale = useLocaleId();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
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

  // Account management
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [accountDriverId, setAccountDriverId] = useState<string | null>(null);
  const [accountDriverName, setAccountDriverName] = useState("");
  const [accountDriverPhone, setAccountDriverPhone] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Search + filtering + sorting
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return drivers;
    const q = search.toLowerCase();
    return drivers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.mobileNumber && d.mobileNumber.toLowerCase().includes(q))
    );
  }, [drivers, search]);

  const { sortedData, sortKey, sortDir, onSort } = useSortable(filtered);

  // Form fields
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DriversResponse>("/drivers");
      setDrivers(res.data.data);
    } catch {
      toast.error(t("drivers.failedLoad"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  // Show warning toast if any licences are expiring within 30 days
  useEffect(() => {
    if (drivers.length === 0) return;
    const expiring = drivers.filter(
      (d) => getExpiryStatus(d.licenseExpiryDate) === "expiring"
    );
    const expired = drivers.filter(
      (d) => getExpiryStatus(d.licenseExpiryDate) === "expired"
    );
    if (expiring.length > 0) {
      toast.warning(
        `${expiring.length} ${t("drivers.expiringWarning")}`,
        { id: "licence-expiring-warning" }
      );
    }
    if (expired.length > 0) {
      toast.error(
        `${expired.length} ${t("drivers.expiredWarning")}`,
        { id: "licence-expired-warning" }
      );
    }
  }, [drivers, t]);

  function resetForm() {
    setName("");
    setMobileNumber("");
    setLicenseNumber("");
    setLicenseExpiryDate("");
  }

  function openAddDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(driver: Driver) {
    setEditingDriver(driver);
    setName(driver.name);
    setMobileNumber(driver.mobileNumber);
    setLicenseNumber(driver.licenseNumber || "");
    setLicenseExpiryDate(
      driver.licenseExpiryDate
        ? new Date(driver.licenseExpiryDate).toISOString().split("T")[0]
        : ""
    );
    setEditDialogOpen(true);
  }

  async function handleCreate() {
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error(t("drivers.nameRequired"));
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/drivers", {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        licenseNumber: licenseNumber.trim() || undefined,
        licenseExpiryDate: licenseExpiryDate || undefined,
      });
      toast.success(t("drivers.created"));
      setDialogOpen(false);
      resetForm();
      fetchDrivers();
    } catch {
      toast.error(t("drivers.failedCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editingDriver) return;
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error(t("drivers.nameRequired"));
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/drivers/${editingDriver.id}`, {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        licenseNumber: licenseNumber.trim() || undefined,
        licenseExpiryDate: licenseExpiryDate || undefined,
      });
      toast.success(t("drivers.updated"));
      setEditDialogOpen(false);
      setEditingDriver(null);
      resetForm();
      fetchDrivers();
    } catch {
      toast.error(t("drivers.failedUpdate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachmentUpload(
    driverId: string,
    file: File
  ) {
    setUploadingId(driverId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ url: string }>(
        `/drivers/${driverId}/attachment`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === driverId ? { ...d, attachmentUrl: res.data.url } : d
        )
      );
      toast.success(t("drivers.attachmentUploaded"));
    } catch {
      toast.error(t("drivers.failedUpload"));
    } finally {
      setUploadingId(null);
    }
  }

  function triggerFileUpload(driverId: string) {
    setUploadingId(driverId);
    if (fileInputRef.current) {
      fileInputRef.current.dataset.driverId = driverId;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const driverId = e.target.dataset.driverId;
    if (file && driverId) {
      handleAttachmentUpload(driverId, file);
    } else {
      setUploadingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get("/drivers/export/excel", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `drivers_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t("drivers.exportSuccess"));
    } catch {
      toast.error(t("drivers.failedExport"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const res = await api.get("/drivers/import/template", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "drivers_import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("drivers.failedTemplate"));
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/drivers/import/excel", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const result = res.data.data;
      setImportResult({
        open: true,
        imported: result.imported,
        errors: result.errors,
      });
      if (result.imported > 0) {
        fetchDrivers();
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("drivers.failedImport");
      toast.error(message);
    } finally {
      setImporting(false);
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
    }
  }

  function openAccountDialog(driver: Driver) {
    setAccountDriverId(driver.id);
    setAccountDriverName(driver.name);
    setAccountDriverPhone(driver.mobileNumber);
    setAccountPassword("");
    setAccountDialogOpen(true);
  }

  function openPasswordDialog(driver: Driver) {
    setAccountDriverId(driver.id);
    setAccountDriverName(driver.name);
    setNewPassword("");
    setPasswordDialogOpen(true);
  }

  async function handleCreateAccount() {
    if (!accountDriverId || !accountPassword.trim()) {
      toast.error(t("drivers.passwordRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/drivers/${accountDriverId}/account`, {
        password: accountPassword.trim(),
      });
      toast.success(t("drivers.accountCreated"));
      setAccountDialogOpen(false);
      fetchDrivers();
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
    if (!accountDriverId || !newPassword.trim()) {
      toast.error(t("drivers.passwordRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.patch(`/drivers/${accountDriverId}/account/password`, {
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

  async function handleToggleStatus(id: string) {
    try {
      await api.patch(`/drivers/${id}/status`);
      setDrivers((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isActive: !d.isActive } : d))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  function openDeleteDialog(driver: Driver) {
    setDeletingDriver(driver);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingDriver) return;
    setDeleting(true);
    try {
      await api.delete(`/drivers/${deletingDriver.id}`);
      toast.success(t("drivers.deleted"));
      setDeleteDialogOpen(false);
      setDeletingDriver(null);
      fetchDrivers();
    } catch {
      toast.error(t("drivers.failedDelete"));
    } finally {
      setDeleting(false);
    }
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:3001";

  const driverFormFields = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="driver-name" className="text-muted-foreground">
          {t("common.name")} *
        </Label>
        <Input
          id="driver-name"
          placeholder={t("drivers.fullName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="driver-mobile" className="text-muted-foreground">
          {t("drivers.mobileNumber")} *
        </Label>
        <Input
          id="driver-mobile"
          placeholder="+20 xxx xxx xxxx"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="driver-license" className="text-muted-foreground">
          {t("drivers.licenseNumber")}
        </Label>
        <Input
          id="driver-license"
          placeholder={t("drivers.licenseNumber")}
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="driver-expiry" className="text-muted-foreground">
          {t("drivers.licenseExpiryDate")}
        </Label>
        <Input
          id="driver-expiry"
          type="date"
          value={licenseExpiryDate}
          onChange={(e) => setLicenseExpiryDate(e.target.value)}
          className="border-border bg-muted/50 text-foreground"
        />
      </div>

    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t("drivers.title")}
          description={t("drivers.description")}
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
            {t("drivers.addDriver")}
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
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("drivers.noDrivers")}
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            {t("drivers.addDriver")}
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
                <SortableHeader
                  label={t("drivers.name")}
                  sortKey="name"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHeader
                  label={t("drivers.mobile")}
                  sortKey="mobileNumber"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <TableHead className="text-white text-xs">
                  {t("drivers.licenseNo")}
                </TableHead>
                <SortableHeader
                  label={t("drivers.licenseExpiry")}
                  sortKey="licenseExpiryDate"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <TableHead className="text-white text-xs">
                  {t("drivers.attachment")}
                </TableHead>
                <TableHead className="text-white text-xs">{t("drivers.account")}</TableHead>
                <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                <TableHead className="text-right text-white text-xs">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((driver, idx) => {
                const expiryStatus = getExpiryStatus(
                  driver.licenseExpiryDate
                );
                return (
                  <TableRow
                    key={driver.id}
                    className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                  >
                    <TableCell className="font-medium text-foreground">
                      {driver.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {driver.mobileNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {driver.licenseNumber || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatDate(driver.licenseExpiryDate)}
                        </span>
                        {expiryStatus === "expired" && (
                          <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                            {t("drivers.expired")}
                          </Badge>
                        )}
                        {expiryStatus === "expiring" && (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {t("drivers.expiringSoon")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {driver.attachmentUrl ? (
                        <a
                          href={`${backendUrl}${driver.attachmentUrl}`}
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
                          onClick={() => triggerFileUpload(driver.id)}
                          disabled={uploadingId === driver.id}
                        >
                          {uploadingId === driver.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {t("common.upload")}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {driver.userId ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20">
                            {driver.user?.email ?? "Linked"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => openPasswordDialog(driver)}
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
                          onClick={() => openAccountDialog(driver)}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          {t("drivers.createAccount")}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleStatus(driver.id)} className="cursor-pointer">
                        {driver.isActive ? (
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditDialog(driver)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                          onClick={() => openDeleteDialog(driver)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("common.delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {/* Add Driver Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>{t("drivers.addNew")}</DialogTitle>
          </DialogHeader>
          {driverFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={submitting} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("drivers.addDriver")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Driver Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingDriver(null);
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>{t("drivers.editDriver")}</DialogTitle>
          </DialogHeader>
          {driverFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleUpdate} disabled={submitting} className="gap-1.5">
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
            <DialogTitle>{t("drivers.createAccountFor")} {accountDriverName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {t("drivers.mobileNumber")}
              </Label>
              <Input
                value={accountDriverPhone}
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
              {t("drivers.createAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("drivers.resetPasswordFor")} {accountDriverName}</DialogTitle>
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
              {t("drivers.resetPassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogOpen(false);
            setDeletingDriver(null);
          }
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("drivers.deleteDriver")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {t("drivers.deleteConfirm")}{" "}
              <span className="font-medium text-foreground">{deletingDriver?.name}</span>?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("drivers.deleteNote")}
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

      {/* Import Results Dialog */}
      <Dialog
        open={importResult.open}
        onOpenChange={(open) => {
          if (!open) setImportResult({ open: false, imported: 0, errors: [] });
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("drivers.importResults")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {importResult.imported} {t("drivers.imported")}
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {importResult.errors.length} {t("drivers.errors")}
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
    </div>
  );
}
