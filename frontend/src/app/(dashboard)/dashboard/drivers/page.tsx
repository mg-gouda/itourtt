"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Users,
  Plus,
  Loader2,
  Pencil,
  Upload,
  Download,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
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

interface Driver {
  id: string;
  name: string;
  mobileNumber: string;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  attachmentUrl: string | null;
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
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

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
      toast.error("Failed to load drivers");
    } finally {
      setLoading(false);
    }
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
        `${expiring.length} driver${expiring.length > 1 ? "s" : ""} with licence expiring within 30 days`,
        { id: "licence-expiring-warning" }
      );
    }
    if (expired.length > 0) {
      toast.error(
        `${expired.length} driver${expired.length > 1 ? "s" : ""} with expired licence`,
        { id: "licence-expired-warning" }
      );
    }
  }, [drivers]);

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
      toast.error("Name and mobile number are required");
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
      toast.success("Driver created successfully");
      setDialogOpen(false);
      resetForm();
      fetchDrivers();
    } catch {
      toast.error("Failed to create driver");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editingDriver) return;
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error("Name and mobile number are required");
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
      toast.success("Driver updated successfully");
      setEditDialogOpen(false);
      setEditingDriver(null);
      resetForm();
      fetchDrivers();
    } catch {
      toast.error("Failed to update driver");
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
      toast.success("Attachment uploaded");
    } catch {
      toast.error("Failed to upload attachment");
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

  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:3001";

  const driverFormFields = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="driver-name" className="text-muted-foreground">
          Name *
        </Label>
        <Input
          id="driver-name"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="driver-mobile" className="text-muted-foreground">
          Mobile Number *
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
          License Number
        </Label>
        <Input
          id="driver-license"
          placeholder="License number"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="driver-expiry" className="text-muted-foreground">
          Licence Expiry Date
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
      <PageHeader
        title="Drivers"
        description="Manage drivers and their assignments"
        action={{ label: "Add Driver", onClick: openAddDialog }}
      />

      {/* Hidden file input for attachment uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelected}
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
      />

      <Card className="border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No drivers found
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              Add Driver
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Mobile</TableHead>
                <TableHead className="text-muted-foreground">
                  License #
                </TableHead>
                <TableHead className="text-muted-foreground">
                  Licence Expiry
                </TableHead>
                <TableHead className="text-muted-foreground">
                  Attachment
                </TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((driver) => {
                const expiryStatus = getExpiryStatus(
                  driver.licenseExpiryDate
                );
                return (
                  <TableRow
                    key={driver.id}
                    className="border-border hover:bg-muted/50"
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
                            Expired
                          </Badge>
                        )}
                        {expiryStatus === "expiring" && (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Expiring Soon
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
                          View
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
                          Upload
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {driver.isActive ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(driver)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Driver Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>Add New Driver</DialogTitle>
          </DialogHeader>
          {driverFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Driver
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
            <DialogTitle>Edit Driver</DialogTitle>
          </DialogHeader>
          {driverFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
