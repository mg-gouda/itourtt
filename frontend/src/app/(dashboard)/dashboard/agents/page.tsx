"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { toast } from "sonner";

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
  isActive: boolean;
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
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [legalName, setLegalName] = useState(INITIAL_FORM.legalName);
  const [tradeName, setTradeName] = useState(INITIAL_FORM.tradeName);
  const [taxId, setTaxId] = useState(INITIAL_FORM.taxId);
  const [address, setAddress] = useState(INITIAL_FORM.address);
  const [city, setCity] = useState(INITIAL_FORM.city);
  const [country, setCountry] = useState(INITIAL_FORM.country);
  const [phone, setPhone] = useState(INITIAL_FORM.phone);
  const [email, setEmail] = useState(INITIAL_FORM.email);
  const [currency, setCurrency] = useState(INITIAL_FORM.currency);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<AgentsResponse>("/agents");
      setAgents(res.data.data);
    } catch {
      toast.error("Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

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
  }

  function openDialog() {
    resetForm();
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!legalName.trim()) {
      toast.error("Legal name is required");
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
      });
      toast.success("Agent created successfully");
      setDialogOpen(false);
      resetForm();
      fetchAgents();
    } catch {
      toast.error("Failed to create agent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Manage travel agents and their profiles"
        action={{ label: "Add Agent", onClick: openDialog }}
      />

      <Card className="border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No agents found</p>
            <Button
              size="sm"
              className="mt-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={openDialog}
            >
              <Plus className="h-4 w-4" />
              Add Agent
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Legal Name</TableHead>
                <TableHead className="text-muted-foreground">Trade Name</TableHead>
                <TableHead className="text-muted-foreground">Tax ID</TableHead>
                <TableHead className="text-muted-foreground">City</TableHead>
                <TableHead className="text-muted-foreground">Country</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Currency</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="border-border hover:bg-accent"
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
                    {agent.isActive ? (
                      <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Agent Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Agent</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="legalName" className="text-muted-foreground">
                Legal Name *
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
                Trade Name
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
                Tax ID
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
                Phone
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
                Email
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
                City
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
                Country
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
                Address
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
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
