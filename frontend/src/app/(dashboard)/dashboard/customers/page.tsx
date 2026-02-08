"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Loader2, Eye } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { toast } from "sonner";
import { useT, useLocaleId } from "@/lib/i18n";

interface Customer {
  id: string;
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  currency: string;
  creditLimit: number | null;
  creditDays: number | null;
  isActive: boolean;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
}

const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR"] as const;

const INITIAL_FORM = {
  legalName: "",
  tradeName: "",
  taxId: "",
  address: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  contactPerson: "",
  currency: "EGP",
  creditLimit: "",
  creditDays: "",
};

export default function CustomersPage() {
  const t = useT();
  const locale = useLocaleId();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.legalName.toLowerCase().includes(q) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const { sortedData, sortKey, sortDir, onSort } = useSortable<Customer>(filtered);

  const [legalName, setLegalName] = useState(INITIAL_FORM.legalName);
  const [tradeName, setTradeName] = useState(INITIAL_FORM.tradeName);
  const [taxId, setTaxId] = useState(INITIAL_FORM.taxId);
  const [address, setAddress] = useState(INITIAL_FORM.address);
  const [city, setCity] = useState(INITIAL_FORM.city);
  const [country, setCountry] = useState(INITIAL_FORM.country);
  const [phone, setPhone] = useState(INITIAL_FORM.phone);
  const [email, setEmail] = useState(INITIAL_FORM.email);
  const [contactPerson, setContactPerson] = useState(INITIAL_FORM.contactPerson);
  const [currency, setCurrency] = useState(INITIAL_FORM.currency);
  const [creditLimit, setCreditLimit] = useState(INITIAL_FORM.creditLimit);
  const [creditDays, setCreditDays] = useState(INITIAL_FORM.creditDays);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<CustomersResponse>("/customers");
      setCustomers(res.data.data);
    } catch {
      toast.error(t("customers.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function handleToggleStatus(id: string) {
    try {
      await api.patch(`/customers/${id}/status`);
      setCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  function resetForm() {
    setLegalName(INITIAL_FORM.legalName);
    setTradeName(INITIAL_FORM.tradeName);
    setTaxId(INITIAL_FORM.taxId);
    setAddress(INITIAL_FORM.address);
    setCity(INITIAL_FORM.city);
    setCountry(INITIAL_FORM.country);
    setPhone(INITIAL_FORM.phone);
    setEmail(INITIAL_FORM.email);
    setContactPerson(INITIAL_FORM.contactPerson);
    setCurrency(INITIAL_FORM.currency);
    setCreditLimit(INITIAL_FORM.creditLimit);
    setCreditDays(INITIAL_FORM.creditDays);
  }

  function openDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(customer: Customer) {
    setEditingCustomer(customer);
    setLegalName(customer.legalName || "");
    setTradeName(customer.tradeName || "");
    setTaxId(customer.taxId || "");
    setAddress(customer.address || "");
    setCity(customer.city || "");
    setCountry(customer.country || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    setContactPerson(customer.contactPerson || "");
    setCurrency(customer.currency || "EGP");
    setCreditLimit(customer.creditLimit != null ? String(customer.creditLimit) : "");
    setCreditDays(customer.creditDays != null ? String(customer.creditDays) : "");
    setEditDialogOpen(true);
  }

  async function handleUpdate() {
    if (!editingCustomer) return;
    if (!legalName.trim()) {
      toast.error(t("customers.legalNameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        legalName: legalName.trim(),
        currency,
      };
      if (tradeName.trim()) payload.tradeName = tradeName.trim();
      if (taxId.trim()) payload.taxId = taxId.trim();
      if (address.trim()) payload.address = address.trim();
      if (city.trim()) payload.city = city.trim();
      if (country.trim()) payload.country = country.trim();
      if (phone.trim()) payload.phone = phone.trim();
      if (email.trim()) payload.email = email.trim();
      if (contactPerson.trim()) payload.contactPerson = contactPerson.trim();
      if (creditLimit) payload.creditLimit = parseFloat(creditLimit);
      if (creditDays) payload.creditDays = parseInt(creditDays, 10);

      await api.patch(`/customers/${editingCustomer.id}`, payload);
      toast.success(t("customers.updated"));
      setEditDialogOpen(false);
      setEditingCustomer(null);
      resetForm();
      fetchCustomers();
    } catch {
      toast.error(t("customers.failedUpdate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!legalName.trim()) {
      toast.error(t("customers.legalNameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        legalName: legalName.trim(),
        currency,
      };
      if (tradeName.trim()) payload.tradeName = tradeName.trim();
      if (taxId.trim()) payload.taxId = taxId.trim();
      if (address.trim()) payload.address = address.trim();
      if (city.trim()) payload.city = city.trim();
      if (country.trim()) payload.country = country.trim();
      if (phone.trim()) payload.phone = phone.trim();
      if (email.trim()) payload.email = email.trim();
      if (contactPerson.trim()) payload.contactPerson = contactPerson.trim();
      if (creditLimit) payload.creditLimit = parseFloat(creditLimit);
      if (creditDays) payload.creditDays = parseInt(creditDays, 10);

      await api.post("/customers", payload);
      toast.success(t("customers.created"));
      setDialogOpen(false);
      resetForm();
      fetchCustomers();
    } catch {
      toast.error(t("customers.failedCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers.title")}
        description={t("customers.description")}
        action={{ label: t("customers.addCustomer"), onClick: openDialog }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">{t("customers.noCustomers")}</p>
          <Button
            size="sm"
            className="mt-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openDialog}
          >
            <Plus className="h-4 w-4" />
            {t("customers.addCustomer")}
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
                <SortableHeader label={t("customers.legalName")} sortKey="legalName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHeader label={t("agents.tradeName")} sortKey="tradeName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">{t("agents.contactPerson")}</TableHead>
                <TableHead className="text-white text-xs">{t("agents.phone")}</TableHead>
                <TableHead className="text-white text-xs">Currency</TableHead>
                <SortableHeader label={t("agents.creditLimit")} sortKey="creditLimit" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <TableHead className="text-white text-xs">{t("agents.creditDays")}</TableHead>
                <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                <TableHead className="text-white text-xs">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((customer, idx) => (
                <TableRow
                  key={customer.id}
                  className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                >
                  <TableCell className="font-medium text-foreground">
                    {customer.legalName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.tradeName || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.contactPerson || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.phone || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.currency}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.creditLimit != null
                      ? customer.creditLimit.toLocaleString(locale)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.creditDays != null ? `${customer.creditDays} days` : "-"}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => handleToggleStatus(customer.id)} className="cursor-pointer">
                      {customer.isActive ? (
                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
                          {t("common.active")}
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/30 transition-colors">
                          {t("common.inactive")}
                        </Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="h-4 w-4" />
                        {t("common.view")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(customer)}
                      >
                        {t("common.edit")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("customers.addCustomer")}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="legalName" className="text-muted-foreground">
                {t("customers.legalName")} *
              </Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name"
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
              <Label htmlFor="contactPerson" className="text-muted-foreground">
                {t("agents.contactPerson")}
              </Label>
              <Input
                id="contactPerson"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Primary contact name"
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
                placeholder="customer@example.com"
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

            <div className="space-y-2">
              <Label htmlFor="currency" className="text-muted-foreground">
                Currency
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full border-border bg-card text-foreground">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {CURRENCIES.map((cur) => (
                    <SelectItem
                      key={cur}
                      value={cur}
                      className="text-foreground focus:bg-accent focus:text-accent-foreground"
                    >
                      {cur}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="creditLimit" className="text-muted-foreground">
                {t("agents.creditLimit")}
              </Label>
              <Input
                id="creditLimit"
                type="number"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="0"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="creditDays" className="text-muted-foreground">
                {t("agents.creditDays")}
              </Label>
              <Input
                id="creditDays"
                type="number"
                min="0"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                placeholder="30"
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
              {t("common.create")} {t("customers.title")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingCustomer(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("customers.editCustomer")}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-legalName" className="text-muted-foreground">
                {t("customers.legalName")} *
              </Label>
              <Input
                id="edit-legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name"
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
              <Label htmlFor="edit-contactPerson" className="text-muted-foreground">
                {t("agents.contactPerson")}
              </Label>
              <Input
                id="edit-contactPerson"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Primary contact name"
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
                placeholder="customer@example.com"
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

            <div className="space-y-2">
              <Label htmlFor="edit-currency" className="text-muted-foreground">
                Currency
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full border-border bg-card text-foreground">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {CURRENCIES.map((cur) => (
                    <SelectItem
                      key={cur}
                      value={cur}
                      className="text-foreground focus:bg-accent focus:text-accent-foreground"
                    >
                      {cur}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-creditLimit" className="text-muted-foreground">
                {t("agents.creditLimit")}
              </Label>
              <Input
                id="edit-creditLimit"
                type="number"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="0"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-creditDays" className="text-muted-foreground">
                {t("agents.creditDays")}
              </Label>
              <Input
                id="edit-creditDays"
                type="number"
                min="0"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                placeholder="30"
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
