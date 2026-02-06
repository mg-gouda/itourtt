"use client";

import { useEffect, useState, useCallback } from "react";
import { Truck, Plus, Loader2 } from "lucide-react";
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

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

  async function handleSubmit() {
    if (!legalName.trim()) {
      toast.error("Legal name is required");
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
      toast.success("Supplier created successfully");
      setDialogOpen(false);
      resetForm();
      fetchSuppliers();
    } catch {
      toast.error("Failed to create supplier");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage transport and service suppliers"
        action={{ label: "Add Supplier", onClick: openDialog }}
      />

      <Card className="border-border bg-card">
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
              No suppliers found
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
              Add Supplier
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
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  className="border-border hover:bg-accent"
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
                    {supplier.isActive ? (
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

      {/* Add Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Supplier</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="legalName" className="text-muted-foreground">
                Legal Name *
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
                placeholder="contact@company.com"
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
              Create Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
