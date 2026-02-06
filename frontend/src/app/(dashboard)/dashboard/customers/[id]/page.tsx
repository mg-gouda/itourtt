"use client";

import { useEffect, useState, useCallback, use, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  ChevronRight,
  Download,
  Upload,
  FileSpreadsheet,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationCombobox } from "@/components/location-combobox";
import api from "@/lib/api";
import { toast } from "sonner";

const SERVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "ARR", label: "Arrival" },
  { value: "DEP", label: "Departure" },
  { value: "ROUND_TRIP", label: "Round Trip (2-Way)" },
  { value: "ONE_WAY_GOING", label: "One Way Going" },
  { value: "ONE_WAY_RETURN", label: "One Way Return" },
  { value: "OVER_DAY", label: "Over Day Trip" },
  { value: "TRANSFER", label: "Long Distance Transfer" },
  { value: "CITY_TOUR", label: "City Tour" },
  { value: "COLLECTING_ONE_WAY", label: "Collecting One Way" },
  { value: "COLLECTING_ROUND_TRIP", label: "Collecting Round Trip" },
  { value: "EXPRESS_SHOPPING", label: "Express Shopping" },
  { value: "EXCURSION", label: "Excursion" },
];

function getServiceTypeLabel(value: string): string {
  return SERVICE_TYPE_OPTIONS.find((o) => o.value === value)?.label || value;
}

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

interface VehicleType {
  id: string;
  name: string;
  seatCapacity: number;
}

interface Zone {
  id: string;
  name: string;
}

interface PriceItem {
  id?: string;
  serviceType: string;
  fromZoneId: string;
  toZoneId: string;
  vehicleTypeId: string;
  transferPrice: number;
  driverTip: number;
  fromZone?: Zone;
  toZone?: Zone;
  vehicleType?: VehicleType;
}

interface RouteRow {
  key: string;
  serviceType: string;
  fromZoneId: string;
  toZoneId: string;
  fromZoneName: string;
  toZoneName: string;
  prices: Record<string, { transferPrice: number; driverTip: number; id?: string }>;
  isNew?: boolean;
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [savedPriceItems, setSavedPriceItems] = useState<PriceItem[]>([]);
  const [newServiceType, setNewServiceType] = useState("ARR");
  const [newFromZone, setNewFromZone] = useState("");
  const [newToZone, setNewToZone] = useState("");
  const [newFromZoneName, setNewFromZoneName] = useState("");
  const [newToZoneName, setNewToZoneName] = useState("");
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const fetchVehicleTypes = useCallback(async () => {
    try {
      const res = await api.get<VehicleType[]>("/vehicles/types");
      const types = Array.isArray(res.data) ? res.data : [];
      // Sort by seat capacity
      types.sort((a, b) => a.seatCapacity - b.seatCapacity);
      setVehicleTypes(types);
    } catch {
      toast.error("Failed to load vehicle types");
    }
  }, []);

  const fetchPriceList = useCallback(async () => {
    try {
      const res = await api.get<{ data: PriceItem[] }>(
        `/customers/${resolvedParams.id}/price-list`
      );
      const items = res.data.data || [];

      // Store raw items for read-only display
      setSavedPriceItems(items);

      // Group by service type + route (fromZone + toZone)
      const routeMap = new Map<string, RouteRow>();

      items.forEach((item) => {
        const routeKey = `${item.serviceType}-${item.fromZoneId}-${item.toZoneId}`;
        if (!routeMap.has(routeKey)) {
          routeMap.set(routeKey, {
            key: routeKey,
            serviceType: item.serviceType,
            fromZoneId: item.fromZoneId,
            toZoneId: item.toZoneId,
            fromZoneName: item.fromZone?.name || "",
            toZoneName: item.toZone?.name || "",
            prices: {},
          });
        }
        const route = routeMap.get(routeKey)!;
        route.prices[item.vehicleTypeId] = {
          transferPrice: Number(item.transferPrice) || 0,
          driverTip: Number(item.driverTip) || 0,
          id: item.id,
        };
      });

      setRoutes(Array.from(routeMap.values()));
    } catch {
      toast.error("Failed to load price list");
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      await Promise.all([fetchCustomer(), fetchVehicleTypes(), fetchPriceList()]);
      setLoading(false);
    }
    loadData();
  }, [fetchCustomer, fetchVehicleTypes, fetchPriceList]);

  function handlePriceChange(
    routeKey: string,
    vehicleTypeId: string,
    field: "transferPrice" | "driverTip",
    value: string
  ) {
    setRoutes((prev) =>
      prev.map((route) => {
        if (route.key !== routeKey) return route;
        const currentPrices = route.prices[vehicleTypeId] || {
          transferPrice: 0,
          driverTip: 0,
        };
        return {
          ...route,
          prices: {
            ...route.prices,
            [vehicleTypeId]: {
              ...currentPrices,
              [field]: parseFloat(value) || 0,
            },
          },
        };
      })
    );
  }

  function addRoute() {
    if (!newFromZone || !newToZone) {
      toast.error("Please select both From and To zones");
      return;
    }
    const routeKey = `${newServiceType}-${newFromZone}-${newToZone}`;
    if (routes.some((r) => r.key === routeKey)) {
      toast.error("This service type + route combination already exists");
      return;
    }
    setRoutes((prev) => [
      ...prev,
      {
        key: routeKey,
        serviceType: newServiceType,
        fromZoneId: newFromZone,
        toZoneId: newToZone,
        fromZoneName: newFromZoneName,
        toZoneName: newToZoneName,
        prices: {},
        isNew: true,
      },
    ]);
    setNewFromZone("");
    setNewToZone("");
    setNewFromZoneName("");
    setNewToZoneName("");
  }

  function removeRoute(routeKey: string) {
    setRoutes((prev) => prev.filter((r) => r.key !== routeKey));
  }

  async function savePriceList() {
    try {
      setSaving(true);

      // Build the items array
      const items: {
        serviceType: string;
        fromZoneId: string;
        toZoneId: string;
        vehicleTypeId: string;
        transferPrice: number;
        driverTip: number;
      }[] = [];

      routes.forEach((route) => {
        vehicleTypes.forEach((vt) => {
          const priceData = route.prices[vt.id];
          // Only include if there's a price set
          if (priceData && (priceData.transferPrice > 0 || priceData.driverTip > 0)) {
            items.push({
              serviceType: route.serviceType,
              fromZoneId: route.fromZoneId,
              toZoneId: route.toZoneId,
              vehicleTypeId: vt.id,
              transferPrice: priceData.transferPrice,
              driverTip: priceData.driverTip,
            });
          }
        });
      });

      await api.post(`/customers/${resolvedParams.id}/price-list`, { items });
      toast.success("Price list saved successfully");

      // Refresh to get IDs
      await fetchPriceList();
    } catch {
      toast.error("Failed to save price list");
    } finally {
      setSaving(false);
    }
  }

  async function downloadTemplate() {
    try {
      const response = await api.get("/customers/price-list/template", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "price-list-template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch {
      toast.error("Failed to download template");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post<{ data: { imported: number; errors: string[] }; message: string }>(
        `/customers/${resolvedParams.id}/price-list/import`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const { imported, errors } = res.data.data;
      if (errors.length > 0) {
        toast.warning(`Imported ${imported} items with ${errors.length} errors`);
        errors.slice(0, 5).forEach((err) => toast.error(err));
      } else {
        toast.success(`Successfully imported ${imported} price items`);
      }

      // Refresh the price list
      await fetchPriceList();
    } catch {
      toast.error("Failed to import price list");
    } finally {
      setImporting(false);
      // Reset the input
      e.target.value = "";
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!itemId) return;

    setDeleting(itemId);
    try {
      await api.delete(`/customers/${resolvedParams.id}/price-list/${itemId}`);
      toast.success("Price item deleted");
      await fetchPriceList();
    } catch {
      toast.error("Failed to delete price item");
    } finally {
      setDeleting(null);
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
                      {customer.creditLimit.toLocaleString()} {customer.currency}
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

        <TabsContent value="prices" className="space-y-4">
          {/* Edit Price List */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-foreground">
                {savedPriceItems.length > 0 ? "Add / Edit Prices" : "Price List"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  className="gap-1.5 border-border"
                >
                  <Download className="h-4 w-4" />
                  Template
                </Button>
                <label>
                  <Button
                    variant="outline"
                    className="gap-1.5 border-border cursor-pointer"
                    disabled={importing}
                    asChild
                  >
                    <span>
                      {importing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Import
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImport}
                    className="hidden"
                    disabled={importing}
                  />
                </label>
                <Button
                  onClick={savePriceList}
                  disabled={saving}
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Route Section */}
              <div className="flex items-end gap-4 rounded-lg border border-border bg-muted/50 p-4">
                <div className="w-52 space-y-2">
                  <span className="text-sm text-muted-foreground">Service Type</span>
                  <Select value={newServiceType} onValueChange={setNewServiceType}>
                    <SelectTrigger className="border-border bg-card text-foreground">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-muted-foreground">From Zone</span>
                  <LocationCombobox
                    value={newFromZone}
                    onChange={(id, _type, name) => {
                      setNewFromZone(id);
                      setNewFromZoneName(name || "");
                    }}
                    types={["ZONE"]}
                    placeholder="Select origin zone..."
                  />
                </div>
                <ChevronRight className="mb-2 h-5 w-5 text-muted-foreground" />
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-muted-foreground">To Zone</span>
                  <LocationCombobox
                    value={newToZone}
                    onChange={(id, _type, name) => {
                      setNewToZone(id);
                      setNewToZoneName(name || "");
                    }}
                    types={["ZONE"]}
                    placeholder="Select destination zone..."
                  />
                </div>
                <Button
                  onClick={addRoute}
                  variant="outline"
                  className="gap-1.5 border-border"
                >
                  <Plus className="h-4 w-4" />
                  Add Route
                </Button>
              </div>

              {/* Price Grid */}
              {routes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No price items yet. Add a route above to get started.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground min-w-[280px]">
                          Route
                        </TableHead>
                        {vehicleTypes.map((vt) => (
                          <TableHead
                            key={vt.id}
                            colSpan={2}
                            className="text-center text-muted-foreground border-l border-border"
                          >
                            {vt.name}
                            <span className="ml-1 text-xs">({vt.seatCapacity} Pax)</span>
                          </TableHead>
                        ))}
                        <TableHead className="text-muted-foreground w-[50px]" />
                      </TableRow>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead />
                        {vehicleTypes.map((vt) => (
                          <Fragment key={vt.id}>
                            <TableHead
                              className="text-xs text-muted-foreground text-center border-l border-border"
                            >
                              Price
                            </TableHead>
                            <TableHead
                              className="text-xs text-muted-foreground text-center"
                            >
                              Tip
                            </TableHead>
                          </Fragment>
                        ))}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routes.map((route) => (
                        <TableRow
                          key={route.key}
                          className="border-border hover:bg-accent"
                        >
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs shrink-0">
                                {getServiceTypeLabel(route.serviceType)}
                              </Badge>
                              <span>{route.fromZoneName || route.fromZoneId}</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              <span>{route.toZoneName || route.toZoneId}</span>
                              {route.isNew && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-500/20 text-blue-600 border-blue-500/30"
                                >
                                  New
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          {vehicleTypes.map((vt) => {
                            const priceData = route.prices[vt.id] || {
                              transferPrice: 0,
                              driverTip: 0,
                            };
                            return (
                              <Fragment key={`${route.key}-${vt.id}`}>
                                <TableCell className="border-l border-border p-1">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={priceData.transferPrice || ""}
                                    onChange={(e) =>
                                      handlePriceChange(
                                        route.key,
                                        vt.id,
                                        "transferPrice",
                                        e.target.value
                                      )
                                    }
                                    placeholder="0"
                                    className="h-8 w-20 text-center border-border bg-card text-foreground"
                                  />
                                </TableCell>
                                <TableCell className="p-1">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={priceData.driverTip || ""}
                                    onChange={(e) =>
                                      handlePriceChange(
                                        route.key,
                                        vt.id,
                                        "driverTip",
                                        e.target.value
                                      )
                                    }
                                    placeholder="0"
                                    className="h-8 w-20 text-center border-border bg-card text-foreground"
                                  />
                                </TableCell>
                              </Fragment>
                            );
                          })}
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRoute(route.key)}
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Saved Price List - Grid View with Actions */}
          {savedPriceItems.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Current Price List
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground min-w-[280px]">
                          Route
                        </TableHead>
                        {vehicleTypes.map((vt) => (
                          <TableHead
                            key={vt.id}
                            colSpan={2}
                            className="text-center text-muted-foreground border-l border-border"
                          >
                            {vt.name}
                            <span className="ml-1 text-xs">({vt.seatCapacity} Pax)</span>
                          </TableHead>
                        ))}
                        <TableHead className="text-muted-foreground w-[100px] text-center">Actions</TableHead>
                      </TableRow>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead />
                        {vehicleTypes.map((vt) => (
                          <Fragment key={vt.id}>
                            <TableHead className="text-xs text-muted-foreground text-center border-l border-border">
                              Price
                            </TableHead>
                            <TableHead className="text-xs text-muted-foreground text-center">
                              Tip
                            </TableHead>
                          </Fragment>
                        ))}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        // Group saved items by service type + route
                        const savedRouteMap = new Map<string, {
                          serviceType: string;
                          fromZoneName: string;
                          toZoneName: string;
                          fromZoneId: string;
                          toZoneId: string;
                          prices: Record<string, { transferPrice: number; driverTip: number; id?: string }>;
                        }>();

                        savedPriceItems.forEach((item) => {
                          const routeKey = `${item.serviceType}-${item.fromZoneId}-${item.toZoneId}`;
                          if (!savedRouteMap.has(routeKey)) {
                            savedRouteMap.set(routeKey, {
                              serviceType: item.serviceType,
                              fromZoneName: item.fromZone?.name || item.fromZoneId,
                              toZoneName: item.toZone?.name || item.toZoneId,
                              fromZoneId: item.fromZoneId,
                              toZoneId: item.toZoneId,
                              prices: {},
                            });
                          }
                          const route = savedRouteMap.get(routeKey)!;
                          route.prices[item.vehicleTypeId] = {
                            transferPrice: Number(item.transferPrice) || 0,
                            driverTip: Number(item.driverTip) || 0,
                            id: item.id,
                          };
                        });

                        return Array.from(savedRouteMap.entries()).map(([routeKey, route]) => (
                          <TableRow key={routeKey} className="border-border hover:bg-accent">
                            <TableCell className="font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {getServiceTypeLabel(route.serviceType)}
                                </Badge>
                                <span>{route.fromZoneName}</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                <span>{route.toZoneName}</span>
                              </div>
                            </TableCell>
                            {vehicleTypes.map((vt) => {
                              const priceData = route.prices[vt.id];
                              return (
                                <Fragment key={`${routeKey}-${vt.id}`}>
                                  <TableCell className="border-l border-border text-center font-mono text-foreground">
                                    {priceData?.transferPrice ? priceData.transferPrice.toLocaleString() : "\u2014"}
                                  </TableCell>
                                  <TableCell className="text-center font-mono text-foreground">
                                    {priceData?.driverTip ? priceData.driverTip.toLocaleString() : "\u2014"}
                                  </TableCell>
                                </Fragment>
                              );
                            })}
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    // Load all prices for this route into edit grid
                                    const existingRoute = routes.find((r) => r.key === routeKey);
                                    if (!existingRoute) {
                                      setRoutes((prev) => [
                                        ...prev,
                                        {
                                          key: routeKey,
                                          serviceType: route.serviceType,
                                          fromZoneId: route.fromZoneId,
                                          toZoneId: route.toZoneId,
                                          fromZoneName: route.fromZoneName,
                                          toZoneName: route.toZoneName,
                                          prices: route.prices,
                                        },
                                      ]);
                                    }
                                    toast.info("Route loaded for editing. Make changes and click Save All.");
                                  }}
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Edit Route"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    // Delete all price items for this route
                                    const itemIds = Object.values(route.prices)
                                      .map((p) => p.id)
                                      .filter((id): id is string => !!id);
                                    if (itemIds.length === 0) return;

                                    setDeleting(routeKey);
                                    try {
                                      await Promise.all(
                                        itemIds.map((id) =>
                                          api.delete(`/customers/${resolvedParams.id}/price-list/${id}`)
                                        )
                                      );
                                      toast.success("Route prices deleted");
                                      await fetchPriceList();
                                    } catch {
                                      toast.error("Failed to delete route prices");
                                    } finally {
                                      setDeleting(null);
                                    }
                                  }}
                                  disabled={deleting === routeKey}
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete Route"
                                >
                                  {deleting === routeKey ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
