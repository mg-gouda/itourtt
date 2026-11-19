"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoutePriceGrid, RoutePriceGridData, RoutePriceCellEdit, downloadXlsx } from "@/components/route-price-grid";
import { usePermission } from "@/hooks/use-permission";
import { Download, Upload } from "lucide-react";
import { ImportTemplateManager } from "@/components/import-template-manager";
import api from "@/lib/api";
import { toast } from "sonner";
import { useLocaleId } from "@/lib/i18n";

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

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const locale = useLocaleId();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceGrid, setPriceGrid] = useState<RoutePriceGridData | null>(null);
  const canEditPrices = usePermission("customers.detail.priceList.editPrice");
  const canImportPrices = usePermission("customers.detail.priceList.import");

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await api.get<{ data: Customer }>(
        `/customers/${resolvedParams.id}`
      );
      setCustomer(res.data.data);
    } catch {
      toast.error("Failed to load customer");
      router.push("/dashboard/customers");
    }
  }, [resolvedParams.id, router]);

  const fetchPriceList = useCallback(async () => {
    try {
      const p = await api.get(`/route-prices/customers/${resolvedParams.id}`);
      setPriceGrid(p.data.data);
    } catch {
      toast.error("Failed to load prices");
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      await Promise.all([fetchCustomer(), fetchPriceList()]);
      setLoading(false);
    }
    loadData();
  }, [fetchCustomer, fetchPriceList]);

  async function savePrices(cells: RoutePriceCellEdit[]) {
    try {
      const { data } = await api.put(`/route-prices/customers/${resolvedParams.id}`, { cells });
      toast.success(`Saved ${data.data.saved} price(s)${data.data.cleared ? `, cleared ${data.data.cleared}` : ""}`);
      await fetchPriceList();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to save prices");
      throw e; // the grid keeps the edits pending
    }
  }

  async function importSheet(kind: "customers", file?: File) {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/route-prices/${kind}/import`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const r = data.data;
      toast.success(`Imported: ${r.pricesSaved} prices set, ${r.pricesCleared} cleared`);
      const missing = [...(r.unmatchedCustomers ?? []).map((u: any) => `customer "${u.name}"`), ...(r.unmatchedOperations ?? []).map((u: any) => u.operation)];
      if (missing.length) toast.warning(`Not matched: ${missing.join(", ")}`, { duration: 20000 });
      await fetchPriceList();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Import failed");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/customers")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={customer.tradeName || customer.legalName}
          description={customer.tradeName ? customer.legalName : undefined}
        />
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="info">Overview</TabsTrigger>
          <TabsTrigger value="prices">Price List</TabsTrigger>
          <TabsTrigger value="templates">Import Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Legal Name</span>
                  <p className="font-medium text-foreground">
                    {customer.legalName}
                  </p>
                </div>
                {customer.tradeName && (
                  <div>
                    <span className="text-muted-foreground">Trade Name</span>
                    <p className="font-medium text-foreground">
                      {customer.tradeName}
                    </p>
                  </div>
                )}
                {customer.taxId && (
                  <div>
                    <span className="text-muted-foreground">Tax ID</span>
                    <p className="font-medium text-foreground">
                      {customer.taxId}
                    </p>
                  </div>
                )}
                {customer.contactPerson && (
                  <div>
                    <span className="text-muted-foreground">Contact Person</span>
                    <p className="font-medium text-foreground">
                      {customer.contactPerson}
                    </p>
                  </div>
                )}
                {customer.phone && (
                  <div>
                    <span className="text-muted-foreground">Phone</span>
                    <p className="font-medium text-foreground">
                      {customer.phone}
                    </p>
                  </div>
                )}
                {customer.email && (
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p className="font-medium text-foreground">
                      {customer.email}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Currency</span>
                  <p className="font-medium text-foreground">
                    {customer.currency}
                  </p>
                </div>
                {customer.creditLimit != null && (
                  <div>
                    <span className="text-muted-foreground">Credit Limit</span>
                    <p className="font-medium text-foreground">
                      {customer.creditLimit.toLocaleString(locale)} {customer.currency}
                    </p>
                  </div>
                )}
                {customer.creditDays != null && (
                  <div>
                    <span className="text-muted-foreground">Credit Days</span>
                    <p className="font-medium text-foreground">
                      {customer.creditDays} days
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-medium">
                    {customer.isActive ? (
                      <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-600 border-red-500/30">
                        Inactive
                      </Badge>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices" className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Transfer prices (route × car type)</h3>
              <span className="text-xs text-muted-foreground">B2B jobs for this customer are priced from this grid automatically.</span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadXlsx(() => api.get("/route-prices/customers/export", { responseType: "blob" }), "customer-prices.xlsx")}>
                  <Download className="h-4 w-4 mr-1.5" />Export all customers
                </Button>
                {canImportPrices && (
                  <label className="inline-flex">
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => importSheet("customers", e.target.files?.[0])} />
                    <span className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm"><Upload className="h-4 w-4 mr-1.5" />Import Customer Price List</span>
                  </label>
                )}
              </div>
            </div>
            {priceGrid && <RoutePriceGrid data={priceGrid} canEdit={canEditPrices} onSave={savePrices} />}
          </div>
          <p className="text-xs text-muted-foreground">
            Driver tips (the same for every customer) are on System Parameters › Driver Tariffs › Driver Tips.
          </p>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <ImportTemplateManager customerId={resolvedParams.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
