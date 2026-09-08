"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";
import { type ComplaintCategory, type ComplaintParty, PARTY_LABELS } from "@/lib/complaints";

interface FormState {
  nameEn: string;
  nameAr: string;
  defaultParty: string;
  defaultPenaltyPoints: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  nameEn: "",
  nameAr: "",
  defaultParty: "none",
  defaultPenaltyPoints: "0",
  sortOrder: "0",
  isActive: true,
};

export default function ComplaintCategoriesPage() {
  const t = useT();

  const canAdd = usePermission("complaint-categories.addButton");
  const canEdit = usePermission("complaint-categories.editButton");
  const canDelete = usePermission("complaint-categories.deleteButton");

  const [rows, setRows] = useState<ComplaintCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ComplaintCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      // Inactive categories still need to be visible here — this is the catalog screen.
      const res = await api.get("/complaint-categories?includeInactive=true");
      setRows(res.data.data || []);
    } catch {
      toast.error(t("complaintCategories.loadFailed") || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sortOrder: String(rows.length) });
    setOpen(true);
  };

  const openEdit = (row: ComplaintCategory) => {
    setEditing(row);
    setForm({
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      defaultParty: row.defaultParty ?? "none",
      defaultPenaltyPoints: String(row.defaultPenaltyPoints ?? 0),
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.nameEn.trim() || !form.nameAr.trim()) {
      toast.error("Both the English and Arabic names are required.");
      return;
    }

    const payload = {
      nameEn: form.nameEn.trim(),
      nameAr: form.nameAr.trim(),
      ...(form.defaultParty !== "none"
        ? { defaultParty: form.defaultParty as ComplaintParty }
        : {}),
      defaultPenaltyPoints: Number(form.defaultPenaltyPoints) || 0,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/complaint-categories/${editing.id}`, payload);
        toast.success("Category updated");
      } else {
        await api.post("/complaint-categories", payload);
        toast.success("Category created");
      }
      setOpen(false);
      await fetchCategories();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save the category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ComplaintCategory) => {
    if (!window.confirm(`Delete the "${row.nameEn}" category?`)) return;
    setDeleting(row.id);
    try {
      await api.delete(`/complaint-categories/${row.id}`);
      toast.success("Category deleted");
      await fetchCategories();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete the category");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("complaintCategories.title") || "Complaint Categories"}
        description={
          t("complaintCategories.description") ||
          "What complaints are filed under, who is normally responsible, and the score penalty each one carries"
        }
        action={
          canAdd ? { label: "Add Category", onClick: openCreate } : undefined
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name (EN)</TableHead>
              <TableHead>Name (AR)</TableHead>
              <TableHead>Default responsible</TableHead>
              <TableHead>Score penalty</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No categories yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.nameEn}</TableCell>
                  <TableCell dir="rtl" className="text-right">
                    {row.nameAr}
                  </TableCell>
                  <TableCell>
                    {row.defaultParty ? PARTY_LABELS[row.defaultParty] : "—"}
                  </TableCell>
                  <TableCell>
                    {row.defaultPenaltyPoints > 0 ? (
                      <span className="text-destructive">−{row.defaultPenaltyPoints} pts</span>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>{row.sortOrder}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "outline"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleting === row.id}
                          onClick={() => handleDelete(row)}
                        >
                          {deleting === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>
              The penalty is deducted from the rep or driver job score, which can move the
              accounting fee band — leave it at 0 unless you mean to affect pay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Name (English) *</Label>
                <Input
                  value={form.nameEn}
                  onChange={(e) => set("nameEn", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Name (Arabic) *</Label>
                <Input
                  dir="rtl"
                  value={form.nameAr}
                  onChange={(e) => set("nameAr", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Default responsible</Label>
                <Select
                  value={form.defaultParty}
                  onValueChange={(v) => set("defaultParty", v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not preset</SelectItem>
                    {Object.entries(PARTY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Score penalty</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.defaultPenaltyPoints}
                  onChange={(e) => set("defaultPenaltyPoints", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => set("isActive", v)}
                id="category-active"
              />
              <Label htmlFor="category-active">
                Active — inactive categories stay on old complaints but can no longer be picked
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
