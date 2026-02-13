"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";
import { TableFilterBar } from "@/components/table-filter-bar";

interface Agent {
  id: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  currency: string;
  refPattern: string | null;
  refExample: string | null;
  isActive: boolean;
  creditTerms?: { creditLimit: number; creditDays: number } | null;
}

interface AgentsResponse {
  data: Agent[];
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
  currency: "EGP",
  refPattern: "",
  refExample: "",
};

export default function AgentsPage() {
  const t = useT();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.legalName.toLowerCase().includes(q) ||
        (a.tradeName && a.tradeName.toLowerCase().includes(q)) ||
        (a.city && a.city.toLowerCase().includes(q))
    );
  }, [agents, search]);

  const { sortedData, sortKey, sortDir, onSort } = useSortable<Agent>(filtered);

  const [legalName, setLegalName] = useState(INITIAL_FORM.legalName);
  const [tradeName, setTradeName] = useState(INITIAL_FORM.tradeName);
  const [taxId, setTaxId] = useState(INITIAL_FORM.taxId);
  const [address, setAddress] = useState(INITIAL_FORM.address);
  const [city, setCity] = useState(INITIAL_FORM.city);
  const [country, setCountry] = useState(INITIAL_FORM.country);
  const [phone, setPhone] = useState(INITIAL_FORM.phone);
  const [email, setEmail] = useState(INITIAL_FORM.email);
  const [currency, setCurrency] = useState(INITIAL_FORM.currency);
  const [refPattern, setRefPattern] = useState(INITIAL_FORM.refPattern);
  const [refExample, setRefExample] = useState(INITIAL_FORM.refExample);
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [creditDays, setCreditDays] = useState<number>(0);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<AgentsResponse>("/agents");
      setAgents(res.data.data);
    } catch {
      toast.error(t("agents.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleToggleStatus(id: string) {
    try {
      await api.patch(`/agents/${id}/status`);
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a))
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
    setCurrency(INITIAL_FORM.currency);
    setRefPattern(INITIAL_FORM.refPattern);
    setRefExample(INITIAL_FORM.refExample);
    setCreditLimit(0);
    setCreditDays(0);
  }

  function openDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(agent: Agent) {
    setEditingAgent(agent);
    setLegalName(agent.legalName);
    setTradeName(agent.tradeName || "");
    setTaxId(agent.taxId || "");
    setAddress(agent.address || "");
    setCity(agent.city || "");
    setCountry(agent.country || "");
    setPhone(agent.phone || "");
    setEmail(agent.email || "");
    setCurrency(agent.currency || "EGP");
    setRefPattern(agent.refPattern || "");
    setRefExample(agent.refExample || "");
    setCreditLimit(agent.creditTerms ? Number(agent.creditTerms.creditLimit) : 0);
    setCreditDays(agent.creditTerms ? agent.creditTerms.creditDays : 0);
    setEditDialogOpen(true);
  }

  async function handleUpdate() {
    if (!editingAgent) return;
    if (!legalName.trim()) {
      toast.error(t("agents.legalNameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await Promise.all([
        api.put(`/agents/${editingAgent.id}`, {
          legalName: legalName.trim(),
          tradeName: tradeName.trim(),
          taxId: taxId.trim(),
          address: address.trim(),
          city: city.trim(),
          country: country.trim(),
          phone: phone.trim(),
          email: email.trim(),
          currency,
          ...(refPattern.trim() ? { refPattern: refPattern.trim() } : { refPattern: null }),
          ...(refExample.trim() ? { refExample: refExample.trim() } : { refExample: null }),
        }),
        api.put(`/agents/${editingAgent.id}/credit`, {
          creditLimit,
          creditDays,
        }),
      ]);
      toast.success(t("agents.updated"));
      setEditDialogOpen(false);
      setEditingAgent(null);
      resetForm();
      fetchAgents();
    } catch {
      toast.error(t("agents.failedUpdate"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!legalName.trim()) {
      toast.error(t("agents.legalNameRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/agents", {
        legalName: legalName.trim(),
        tradeName: tradeName.trim(),
        taxId: taxId.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        email: email.trim(),
        currency,
        ...(refPattern.trim() && { refPattern: refPattern.trim() }),
        ...(refExample.trim() && { refExample: refExample.trim() }),
      });
      toast.success(t("agents.created"));
      setDialogOpen(false);
      resetForm();
      fetchAgents();
    } catch {
      toast.error(t("agents.failedCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("agents.title")}
        description={t("agents.description")}
        action={{ label: t("agents.addAgent"), onClick: openDialog }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">{t("agents.noAgents")}</p>
          <Button
            size="sm"
            className="mt-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openDialog}
          >
            <Plus className="h-4 w-4" />
            {t("agents.addAgent")}
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
                  <SortableHeader label={t("agents.phone")} sortKey="phone" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <TableHead className="text-white text-xs">Currency</TableHead>
                  <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                  <TableHead className="text-white text-xs">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((agent, idx) => (
                <TableRow
                  key={agent.id}
                  className={`border-border cursor-pointer ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                  onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                >
                  <TableCell className="font-medium text-foreground">
                    {agent.legalName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.tradeName || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.taxId || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.city || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.country || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.phone || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.currency}
                  </TableCell>
                  <TableCell>
                    <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(agent.id); }} className="cursor-pointer">
                      {agent.isActive ? (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); openEditDialog(agent); }}
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

      {/* Add Agent Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("agents.addAgent")}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legalName" className="text-muted-foreground">
                {t("agents.legalName")} *
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
                placeholder="agent@example.com"
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

            <div className="space-y-2">
              <Label htmlFor="refPattern" className="text-muted-foreground">
                {t("agents.refPattern")}
              </Label>
              <Input
                id="refPattern"
                value={refPattern}
                onChange={(e) => setRefPattern(e.target.value)}
                placeholder="e.g. ^INT-\d+$"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refExample" className="text-muted-foreground">
                {t("agents.refExample")}
              </Label>
              <Input
                id="refExample"
                value={refExample}
                onChange={(e) => setRefExample(e.target.value)}
                placeholder="e.g. INT-3550321"
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
              {t("common.create")} {t("agents.title")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingAgent(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("agents.editAgent")}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-legalName" className="text-muted-foreground">
                {t("agents.legalName")} *
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
                placeholder="agent@example.com"
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

            <div className="space-y-2">
              <Label htmlFor="edit-refPattern" className="text-muted-foreground">
                {t("agents.refPattern")}
              </Label>
              <Input
                id="edit-refPattern"
                value={refPattern}
                onChange={(e) => setRefPattern(e.target.value)}
                placeholder="e.g. ^INT-\d+$"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-refExample" className="text-muted-foreground">
                {t("agents.refExample")}
              </Label>
              <Input
                id="edit-refExample"
                value={refExample}
                onChange={(e) => setRefExample(e.target.value)}
                placeholder="e.g. INT-3550321"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="col-span-2 border-t border-border pt-3 mt-1">
              <p className="text-sm font-medium text-foreground mb-3">{t("finance.creditStatus")}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-creditLimit" className="text-muted-foreground">
                    {t("agents.creditLimit")}
                  </Label>
                  <Input
                    id="edit-creditLimit"
                    type="number"
                    min={0}
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(Number(e.target.value) || 0)}
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
                    min={0}
                    value={creditDays}
                    onChange={(e) => setCreditDays(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
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
