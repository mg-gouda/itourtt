"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Pencil, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";

const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR"];

interface Extra {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  currency: string;
  isActive: boolean;
  sortOrder: number;
}

export default function ExtrasPage() {
  const t = useT();
  const canAdd = usePermission("extras.addButton");
  const canEdit = usePermission("extras.editButton");
  const canDelete = usePermission("extras.deleteButton");

  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Extra | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Extra | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExtras = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/extras");
      const data = res.data?.data ?? res.data;
      setExtras(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("extras.failedLoad"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchExtras();
  }, [fetchExtras]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCurrency("EGP");
    setSortOrder("0");
    setIsActive(true);
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (extra: Extra) => {
    setEditing(extra);
    setName(extra.name);
    setDescription(extra.description || "");
    setPrice(String(extra.price));
    setCurrency(extra.currency);
    setSortOrder(String(extra.sortOrder));
    setIsActive(extra.isActive);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("extras.nameRequired"));
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error(t("extras.priceInvalid"));
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: priceNum,
      currency,
      sortOrder: parseInt(sortOrder, 10) || 0,
      isActive,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/extras/${editing.id}`, payload);
        toast.success(t("extras.updated"));
      } else {
        await api.post("/extras", payload);
        toast.success(t("extras.created"));
      }
      setDialogOpen(false);
      setEditing(null);
      resetForm();
      fetchExtras();
    } catch {
      toast.error(editing ? t("extras.failedUpdate") : t("extras.failedCreate"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (extra: Extra) => {
    try {
      await api.patch(`/extras/${extra.id}/status`);
      setExtras((prev) =>
        prev.map((e) => (e.id === extra.id ? { ...e, isActive: !e.isActive } : e)),
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/extras/${deleteTarget.id}`);
      toast.success(t("extras.deleted"));
      setDeleteTarget(null);
      fetchExtras();
    } catch {
      toast.error(t("extras.failedDelete"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("extras.title")}
        description={t("extras.subtitle")}
        action={canAdd ? { label: t("extras.addExtra"), onClick: openAdd } : undefined}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : extras.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          heading={t("extras.emptyTitle")}
          description={t("extras.emptyDescription")}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("extras.price")}</TableHead>
                <TableHead>{t("extras.description")}</TableHead>
                <TableHead className="text-center">{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {extras.map((extra) => (
                <TableRow key={extra.id}>
                  <TableCell className="font-medium text-foreground">{extra.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {extra.currency} {Number(extra.price).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {extra.description || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {canEdit ? (
                      <Switch
                        checked={extra.isActive}
                        onCheckedChange={() => handleToggle(extra)}
                      />
                    ) : (
                      <Badge variant={extra.isActive ? "default" : "secondary"}>
                        {extra.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(extra)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => setDeleteTarget(extra)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Add / Edit Dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("extras.editExtra") : t("extras.addExtra")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="extra-name" className="text-muted-foreground">
                {t("common.name")}
              </Label>
              <Input
                id="extra-name"
                placeholder="e.g. Meet & Greet, Child Seat"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="extra-price" className="text-muted-foreground">
                  {t("extras.price")}
                </Label>
                <Input
                  id="extra-price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t("extras.currency")}</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="border-border bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="extra-description" className="text-muted-foreground">
                {t("extras.description")}
              </Label>
              <Textarea
                id="extra-description"
                rows={2}
                maxLength={300}
                placeholder={t("extras.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="extra-sort" className="text-muted-foreground">
                  {t("extras.sortOrder")}
                </Label>
                <Input
                  id="extra-sort"
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="border-border bg-card text-foreground"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label className="text-muted-foreground">{t("extras.active")}</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? t("common.saveChanges") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("extras.deleteExtra")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("extras.deleteConfirm")} <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="text-muted-foreground hover:text-foreground"
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
    </div>
  );
}
