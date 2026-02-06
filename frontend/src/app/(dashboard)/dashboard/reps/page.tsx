"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  UserCheck,
  Plus,
  Loader2,
  Pencil,
  Upload,
  Download,
  KeyRound,
  UserPlus,
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
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingRep, setEditingRep] = useState<Rep | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Account management
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [accountRepId, setAccountRepId] = useState<string | null>(null);
  const [accountRepName, setAccountRepName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
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
      toast.error("Failed to load reps");
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

  async function handleCreate() {
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error("Name and mobile number are required");
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/reps", {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        ...(feePerFlight !== "" && { feePerFlight: parseFloat(feePerFlight) }),
      });
      toast.success("Rep added successfully");
      setDialogOpen(false);
      resetForm();
      fetchReps();
    } catch {
      toast.error("Failed to add rep");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editingRep) return;
    if (!name.trim() || !mobileNumber.trim()) {
      toast.error("Name and mobile number are required");
      return;
    }

    try {
      setSubmitting(true);
      await api.patch(`/reps/${editingRep.id}`, {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        feePerFlight: feePerFlight !== "" ? parseFloat(feePerFlight) : 0,
      });
      toast.success("Rep updated successfully");
      setEditDialogOpen(false);
      setEditingRep(null);
      resetForm();
      fetchReps();
    } catch {
      toast.error("Failed to update rep");
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
      toast.success("ID copy uploaded");
    } catch {
      toast.error("Failed to upload attachment");
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

  function openAccountDialog(rep: Rep) {
    setAccountRepId(rep.id);
    setAccountRepName(rep.name);
    setAccountEmail("");
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
    if (!accountRepId || !accountEmail.trim() || !accountPassword.trim()) {
      toast.error("Email and password are required");
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/reps/${accountRepId}/account`, {
        email: accountEmail.trim(),
        password: accountPassword.trim(),
      });
      toast.success("Account created successfully");
      setAccountDialogOpen(false);
      fetchReps();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to create account";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!accountRepId || !newPassword.trim()) {
      toast.error("New password is required");
      return;
    }

    try {
      setSubmitting(true);
      await api.patch(`/reps/${accountRepId}/account/password`, {
        password: newPassword.trim(),
      });
      toast.success("Password reset successfully");
      setPasswordDialogOpen(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to reset password";
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
          Name *
        </Label>
        <Input
          id="rep-name"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rep-mobile" className="text-muted-foreground">
          Mobile Number *
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
          Fee per Flight (EGP)
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
      <PageHeader
        title="Reps"
        description="Manage representatives assigned to jobs"
        action={{ label: "Add Rep", onClick: openAddDialog }}
      />

      {/* Hidden file input for ID copy uploads */}
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
        ) : reps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <UserCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              No reps found
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add your first representative to get started.
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              Add Rep
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Mobile</TableHead>
                <TableHead className="text-muted-foreground">Fee/Flight</TableHead>
                <TableHead className="text-muted-foreground">
                  ID Copy
                </TableHead>
                <TableHead className="text-muted-foreground">Account</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.map((rep) => (
                <TableRow
                  key={rep.id}
                  className="border-border hover:bg-muted/50"
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
                        View
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
                        Upload
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
                          Reset
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
                        Create Account
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {rep.isActive ? (
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
                      onClick={() => openEditDialog(rep)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Rep Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Rep</DialogTitle>
          </DialogHeader>
          {repFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Rep
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
            <DialogTitle>Edit Rep</DialogTitle>
          </DialogHeader>
          {repFormFields}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Account Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Account for {accountRepName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="account-email" className="text-muted-foreground">
                Email *
              </Label>
              <Input
                id="account-email"
                type="email"
                placeholder="rep@itour.local"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-password" className="text-muted-foreground">
                Password *
              </Label>
              <Input
                id="account-password"
                type="password"
                placeholder="Minimum 6 characters"
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
              Cancel
            </Button>
            <Button
              onClick={handleCreateAccount}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password for {accountRepName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-muted-foreground">
                New Password *
              </Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 characters"
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
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
