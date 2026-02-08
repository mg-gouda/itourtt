"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Truck, Plus, Loader2 } from "lucide-react";
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

interface Supplier {
  id: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  isActive: boolean;
}

interface SuppliersResponse {
  data: Supplier[];
  total: number;
  page: number;
  limit: number;
}

export default function SuppliersPage() {
  const t = useT();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.legalName.toLowerCase().includes(q) ||
        (s.tradeName && s.tradeName.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const { sortedData, sortKey, sortDir, onSort } = useSortable<Supplier>(filtered);

  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<SuppliersResponse>("/suppliers");
      setSuppliers(data.data);
    } catch {
      toast.error(t("suppliers.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  async function handleToggleStatus(id: string) {
    try {
      await api.patch(`/suppliers/${id}/status`);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  function resetForm() {
    setLegalName("");
    setTradeName("");
    setTaxId("");
    setAddress("");
    setCity("");
    setCountry("");
    setPhone("");
    setEmail("");
  }

  function openDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(supplier: Supplier) {
    setEditingSupplier(supplier);
    setLegalName(supplier.legalName || "");
    setTradeName(supplier.tradeName || "");
    setTaxId(supplier.taxId || "");
    setAddress(supplier.address || "");
    setCity(supplier.city || "");
    setCountry(supplier.country || "");
    setPhone(supplier.phone || "");
    setEmail(supplier.email || "");
    setEditDialogOpen(true);
  }

  async function handleUpdate() {
    if (!editingSupplier) return;
    if (!legalName.trim()) {
      toast.error(t("suppliers.legalNameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.put(`/suppliers/${editingSupplier.id}`, {
        legalName: legalName.trim(),
        tradeName: tradeName.trim(),
        taxId: taxId.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      toast.success(t("suppliers.updated"));
      setEditDialogOpen(false);
      setEditingSupplier(null);
      resetForm();
      fetchSuppliers();
    } catch {
      toast.error(t("suppliers.failedUpdate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!legalName.trim()) {
      toast.error(t("suppliers.legalNameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/suppliers", {
        legalName: legalName.trim(),
        tradeName: tradeName.trim(),
        taxId: taxId.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      toast.success(t("suppliers.created"));
      setDialogOpen(false);
      resetForm();
      fetchSuppliers();
    } catch {
      toast.error(t("suppliers.failedCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("suppliers.title")}
        description={t("suppliers.description")}
        action={{ label: t("suppliers.addSupplier"), onClick: openDialog }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-card">
            <Truck className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {t("suppliers.noSuppliers")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first supplier to get started.
          </p>
          <Button
            size="sm"
            className="mt-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openDialog}
          >
            <Plus className="h-4 w-4" />
            {t("suppliers.addSupplier")}
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
                  <SortableHeader label={t("agents.legalName")} sortKey="legalName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableHeader label={t("agents.tradeName")} sortKey="tradeName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <TableHead className="text-white text-xs">{t("agents.taxId")}</TableHead>
                  <SortableHeader label={t("locations.city")} sortKey="city" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableHeader label={t("locations.country")} sortKey="country" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <TableHead className="text-white text-xs">{t("agents.phone")}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                  <TableHead className="text-right text-white text-xs">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((supplier, idx) => (
                <TableRow
                  key={supplier.id}
                  className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                >
                  <TableCell className="font-medium text-foreground">
                    {supplier.legalName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.tradeName || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.taxId || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.city || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.country || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.phone || "-"}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => handleToggleStatus(supplier.id)} className="cursor-pointer">
                      {supplier.isActive ? (
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
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => openEditDialog(supplier)}
                    >
                      {t("common.edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("suppliers.addSupplier")}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="legalName" className="text-muted-foreground">
                {t("agents.legalName")} *
              </Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Company legal name"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tradeName" className="text-muted-foreground">
                {t("agents.tradeName")}
              </Label>
              <Input
                id="tradeName"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder="Trade / brand name"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId" className="text-muted-foreground">
                {t("agents.taxId")}
              </Label>
              <Input
                id="taxId"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Tax registration number"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-muted-foreground">
                {t("agents.phone")}
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+20 xxx xxx xxxx"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">
                {t("common.email")}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@company.com"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city" className="text-muted-foreground">
                {t("locations.city")}
              </Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country" className="text-muted-foreground">
                {t("locations.country")}
              </Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="address" className="text-muted-foreground">
                {t("agents.address")}
              </Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full street address"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
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
              {t("common.create")} {t("suppliers.title")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingSupplier(null);
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("suppliers.editSupplier")}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-legalName" className="text-muted-foreground">
                {t("agents.legalName")} *
              </Label>
              <Input
                id="edit-legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Company legal name"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tradeName" className="text-muted-foreground">
                {t("agents.tradeName")}
              </Label>
              <Input
                id="edit-tradeName"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder="Trade / brand name"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-taxId" className="text-muted-foreground">
                {t("agents.taxId")}
              </Label>
              <Input
                id="edit-taxId"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Tax registration number"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone" className="text-muted-foreground">
                {t("agents.phone")}
              </Label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+20 xxx xxx xxxx"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-muted-foreground">
                {t("common.email")}
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@company.com"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-city" className="text-muted-foreground">
                {t("locations.city")}
              </Label>
              <Input
                id="edit-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-country" className="text-muted-foreground">
                {t("locations.country")}
              </Label>
              <Input
                id="edit-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-address" className="text-muted-foreground">
                {t("agents.address")}
              </Label>
              <Input
                id="edit-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full street address"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={submitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
