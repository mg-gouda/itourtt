"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Car,
  UserRound,
  Pencil,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PriceListGrid, PriceGridItem, PriceGridVehicleType } from "@/components/price-list-grid";
import api from "@/lib/api";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";

// ─── Types ─────────────────────────────────────

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
  userId?: string | null;
  user?: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
  isActive: boolean;
}

interface VehicleType {
  id: string;
  name: string;
  seatCapacity: number;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleTypeId: string;
  vehicleType?: VehicleType;
  ownership: string;
  color: string | null;
  carBrand: string | null;
  carModel: string | null;
  makeYear: number | null;
  luggageCapacity: number | null;
  isActive: boolean;
}

interface SupplierDriver {
  id: string;
  name: string;
  mobileNumber: string;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  isActive: boolean;
}

const OWNERSHIP_OPTIONS = [
  { value: "OWNED", label: "Owned" },
  { value: "RENTED", label: "Rented" },
  { value: "CONTRACTED", label: "Contracted" },
];

// ─── Component ─────────────────────────────────

export default function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const t = useT();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  // Vehicles
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);

  // Vehicle form
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [ownership, setOwnership] = useState("OWNED");
  const [color, setColor] = useState("");
  const [carBrand, setCarBrand] = useState("");
  const [carModel, setCarModel] = useState("");
  const [makeYear, setMakeYear] = useState("");
  const [luggageCapacity, setLuggageCapacity] = useState("");

  // Price list
  const [priceItems, setPriceItems] = useState<PriceGridItem[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  // Drivers
  const [drivers, setDrivers] = useState<SupplierDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<SupplierDriver | null>(null);
  const [driverSubmitting, setDriverSubmitting] = useState(false);

  // Driver form
  const [driverName, setDriverName] = useState("");
  const [driverMobile, setDriverMobile] = useState("");
  const [driverLicense, setDriverLicense] = useState("");
  const [driverLicenseExpiry, setDriverLicenseExpiry] = useState("");

  // Sortable vehicles
  const { sortedData: sortedVehicles, sortKey, sortDir, onSort } = useSortable<Vehicle>(vehicles);
  const { sortedData: sortedDrivers, sortKey: driverSortKey, sortDir: driverSortDir, onSort: onDriverSort } = useSortable<SupplierDriver>(drivers);

  // ─── Fetch ──────────────────────────────────

  const fetchSupplier = useCallback(async () => {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}`);
      const data = res.data?.data || res.data;
      setSupplier(data);
    } catch {
      toast.error("Failed to load supplier");
      router.push("/dashboard/suppliers");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.id, router]);

  const fetchVehicleTypes = useCallback(async () => {
    try {
      const res = await api.get<VehicleType[]>("/vehicles/types");
      const types = Array.isArray(res.data) ? res.data : [];
      types.sort((a, b) => a.seatCapacity - b.seatCapacity);
      setVehicleTypes(types);
    } catch {
      // silent
    }
  }, []);

  const fetchVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/vehicles?limit=100`);
      const d = res.data?.data;
      setVehicles(d?.data || d || []);
    } catch {
      toast.error("Failed to load vehicles");
    } finally {
      setVehiclesLoading(false);
    }
  }, [resolvedParams.id]);

  const fetchPriceList = useCallback(async () => {
    setPriceLoading(true);
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/price-list`);
      const data = res.data?.data || [];
      setPriceItems(data);
    } catch {
      toast.error("Failed to load price list");
    } finally {
      setPriceLoading(false);
    }
  }, [resolvedParams.id]);

  const fetchDrivers = useCallback(async () => {
    setDriversLoading(true);
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/drivers?limit=100`);
      const d = res.data?.data;
      setDrivers(d?.data || d || []);
    } catch {
      toast.error("Failed to load drivers");
    } finally {
      setDriversLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.id]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        await Promise.all([fetchSupplier(), fetchVehicleTypes(), fetchVehicles(), fetchPriceList(), fetchDrivers()]);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [fetchSupplier, fetchVehicleTypes, fetchVehicles, fetchPriceList, fetchDrivers]);

  // ─── Vehicle handlers ───────────────────────

  function resetVehicleForm() {
    setPlateNumber("");
    setVehicleTypeId("");
    setOwnership("OWNED");
    setColor("");
    setCarBrand("");
    setCarModel("");
    setMakeYear("");
    setLuggageCapacity("");
    setEditingVehicle(null);
  }

  function openVehicleDialog(vehicle?: Vehicle) {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setPlateNumber(vehicle.plateNumber);
      setVehicleTypeId(vehicle.vehicleTypeId);
      setOwnership(vehicle.ownership);
      setColor(vehicle.color || "");
      setCarBrand(vehicle.carBrand || "");
      setCarModel(vehicle.carModel || "");
      setMakeYear(vehicle.makeYear?.toString() || "");
      setLuggageCapacity(vehicle.luggageCapacity?.toString() || "");
    } else {
      resetVehicleForm();
    }
    setVehicleDialogOpen(true);
  }

  async function handleVehicleSubmit() {
    if (!plateNumber.trim() || !vehicleTypeId) {
      toast.error(t("suppliers.plateAndTypeRequired"));
      return;
    }

    const payload = {
      plateNumber: plateNumber.trim(),
      vehicleTypeId,
      ownership,
      color: color.trim() || undefined,
      carBrand: carBrand.trim() || undefined,
      carModel: carModel.trim() || undefined,
      makeYear: makeYear ? parseInt(makeYear) : undefined,
      luggageCapacity: luggageCapacity ? parseInt(luggageCapacity) : undefined,
    };

    try {
      setVehicleSubmitting(true);
      if (editingVehicle) {
        await api.put(`/suppliers/${resolvedParams.id}/vehicles/${editingVehicle.id}`, payload);
        toast.success(t("suppliers.vehicleUpdated"));
      } else {
        await api.post(`/suppliers/${resolvedParams.id}/vehicles`, payload);
        toast.success(t("suppliers.vehicleAdded"));
      }
      setVehicleDialogOpen(false);
      resetVehicleForm();
      fetchVehicles();
    } catch {
      toast.error(t("suppliers.vehicleFailed"));
    } finally {
      setVehicleSubmitting(false);
    }
  }

  async function handleToggleVehicleStatus(vehicleId: string) {
    try {
      await api.patch(`/suppliers/${resolvedParams.id}/vehicles/${vehicleId}/status`);
      setVehicles((prev) =>
        prev.map((v) => (v.id === vehicleId ? { ...v, isActive: !v.isActive } : v))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  async function handleDeleteVehicle(vehicleId: string) {
    try {
      await api.delete(`/suppliers/${resolvedParams.id}/vehicles/${vehicleId}`);
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
      toast.success(t("suppliers.vehicleRemoved"));
    } catch {
      toast.error(t("suppliers.vehicleRemoveFailed"));
    }
  }

  // ─── Driver handlers ───────────────────────

  function resetDriverForm() {
    setDriverName("");
    setDriverMobile("");
    setDriverLicense("");
    setDriverLicenseExpiry("");
    setEditingDriver(null);
  }

  function openDriverDialog(driver?: SupplierDriver) {
    if (driver) {
      setEditingDriver(driver);
      setDriverName(driver.name);
      setDriverMobile(driver.mobileNumber);
      setDriverLicense(driver.licenseNumber || "");
      setDriverLicenseExpiry(driver.licenseExpiryDate ? driver.licenseExpiryDate.slice(0, 10) : "");
    } else {
      resetDriverForm();
    }
    setDriverDialogOpen(true);
  }

  async function handleDriverSubmit() {
    if (!driverName.trim() || !driverMobile.trim()) {
      toast.error(t("suppliers.nameAndMobileRequired"));
      return;
    }

    const payload = {
      name: driverName.trim(),
      mobileNumber: driverMobile.trim(),
      licenseNumber: driverLicense.trim() || undefined,
      licenseExpiryDate: driverLicenseExpiry || undefined,
    };

    try {
      setDriverSubmitting(true);
      if (editingDriver) {
        await api.put(`/suppliers/${resolvedParams.id}/drivers/${editingDriver.id}`, payload);
        toast.success(t("suppliers.driverUpdated"));
      } else {
        await api.post(`/suppliers/${resolvedParams.id}/drivers`, payload);
        toast.success(t("suppliers.driverAdded"));
      }
      setDriverDialogOpen(false);
      resetDriverForm();
      fetchDrivers();
    } catch {
      toast.error(t("suppliers.driverFailed"));
    } finally {
      setDriverSubmitting(false);
    }
  }

  async function handleToggleDriverStatus(driverId: string) {
    try {
      await api.patch(`/suppliers/${resolvedParams.id}/drivers/${driverId}/status`);
      setDrivers((prev) =>
        prev.map((d) => (d.id === driverId ? { ...d, isActive: !d.isActive } : d))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  async function handleDeleteDriver(driverId: string) {
    try {
      await api.delete(`/suppliers/${resolvedParams.id}/drivers/${driverId}`);
      setDrivers((prev) => prev.filter((d) => d.id !== driverId));
      toast.success(t("suppliers.driverRemoved"));
    } catch {
      toast.error(t("suppliers.driverRemoveFailed"));
    }
  }

  // ─── Price list handlers ────────────────────

  async function handleSavePriceList(
    items: {
      serviceType: string;
      fromZoneId: string;
      toZoneId: string;
      vehicleTypeId: string;
      price: number;
      driverTip: number;
    }[]
  ) {
    await api.post(`/suppliers/${resolvedParams.id}/price-list`, { items });
  }

  async function handleDeletePriceRoute(itemIds: string[]) {
    await Promise.all(
      itemIds.map((id) => api.delete(`/suppliers/${resolvedParams.id}/price-list/${id}`))
    );
  }

  // ─── Import/Export handlers ─────────────────

  async function handleExportVehicles() {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/vehicles/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `supplier-vehicles.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(t("common.exportSuccess"));
    } catch {
      toast.error(t("common.exportFailed"));
    }
  }

  async function handleDownloadVehicleTemplate() {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/vehicles/template`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "vehicle-import-template.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("common.exportFailed"));
    }
  }

  async function handleImportVehicles(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/suppliers/${resolvedParams.id}/vehicles/import`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const result = res.data?.data;
    toast.success(`Imported ${result?.created ?? 0} vehicles, ${result?.errors?.length ?? 0} errors`);
    fetchVehicles();
  }

  async function handleExportDrivers() {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/drivers/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `supplier-drivers.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(t("common.exportSuccess"));
    } catch {
      toast.error(t("common.exportFailed"));
    }
  }

  async function handleDownloadDriverTemplate() {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/drivers/template`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "driver-import-template.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("common.exportFailed"));
    }
  }

  async function handleImportDrivers(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/suppliers/${resolvedParams.id}/drivers/import`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const result = res.data?.data;
    toast.success(`Imported ${result?.created ?? 0} drivers, ${result?.errors?.length ?? 0} errors`);
    fetchDrivers();
  }

  async function handleExportPriceList() {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/price-list/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `supplier-price-list.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(t("common.exportSuccess"));
    } catch {
      toast.error(t("common.exportFailed"));
    }
  }

  async function handleDownloadPriceListTemplate() {
    try {
      const res = await api.get(`/suppliers/${resolvedParams.id}/price-list/template`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "price-list-import-template.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("common.exportFailed"));
    }
  }

  async function handleImportPriceList(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/suppliers/${resolvedParams.id}/price-list/import`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const result = res.data?.data;
    toast.success(`Imported ${result?.created ?? 0} price items, ${result?.errors?.length ?? 0} errors`);
    fetchPriceList();
  }

  // ─── Render ─────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!supplier) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/suppliers")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={supplier.tradeName || supplier.legalName}
          description={supplier.tradeName ? supplier.legalName : undefined}
        />
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="info">{t("suppliers.tabOverview")}</TabsTrigger>
          <TabsTrigger value="vehicles">
            {t("suppliers.tabVehicles")} ({vehicles.length})
          </TabsTrigger>
          <TabsTrigger value="drivers">
            {t("suppliers.tabDrivers")} ({drivers.length})
          </TabsTrigger>
          <TabsTrigger value="prices">{t("suppliers.tabPriceList")}</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="info" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">
                {t("suppliers.supplierInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">{t("agents.legalName")}</span>
                  <p className="font-medium text-foreground">{supplier.legalName}</p>
                </div>
                {supplier.tradeName && (
                  <div>
                    <span className="text-muted-foreground">{t("agents.tradeName")}</span>
                    <p className="font-medium text-foreground">{supplier.tradeName}</p>
                  </div>
                )}
                {supplier.taxId && (
                  <div>
                    <span className="text-muted-foreground">{t("agents.taxId")}</span>
                    <p className="font-medium text-foreground">{supplier.taxId}</p>
                  </div>
                )}
                {supplier.phone && (
                  <div>
                    <span className="text-muted-foreground">{t("agents.phone")}</span>
                    <p className="font-medium text-foreground">{supplier.phone}</p>
                  </div>
                )}
                {supplier.email && (
                  <div>
                    <span className="text-muted-foreground">{t("common.email")}</span>
                    <p className="font-medium text-foreground">{supplier.email}</p>
                  </div>
                )}
                {supplier.city && (
                  <div>
                    <span className="text-muted-foreground">{t("locations.city")}</span>
                    <p className="font-medium text-foreground">{supplier.city}</p>
                  </div>
                )}
                {supplier.country && (
                  <div>
                    <span className="text-muted-foreground">{t("locations.country")}</span>
                    <p className="font-medium text-foreground">{supplier.country}</p>
                  </div>
                )}
                {supplier.address && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t("agents.address")}</span>
                    <p className="font-medium text-foreground">{supplier.address}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">{t("common.status")}</span>
                  <p className="font-medium">
                    {supplier.isActive ? (
                      <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                        {t("common.active")}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-600 border-red-500/30">
                        {t("common.inactive")}
                      </Badge>
                    )}
                  </p>
                </div>
                {supplier.user && (
                  <div>
                    <span className="text-muted-foreground">Account</span>
                    <p className="font-medium text-foreground">{supplier.user.email}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Vehicles Tab ── */}
        <TabsContent value="vehicles" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
              {t("suppliers.vehicles")}
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportVehicles}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Download className="h-4 w-4" />
                {t("common.export")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadVehicleTemplate}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {t("common.template")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".xlsx,.xls";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleImportVehicles(file);
                  };
                  input.click();
                }}
              >
                <Upload className="h-4 w-4" />
                {t("common.import")}
              </Button>
              <Button
                onClick={() => openVehicleDialog()}
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {t("suppliers.addVehicle")}
              </Button>
            </div>
          </div>

          {vehiclesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Car className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("suppliers.noVehicles")}
              </p>
              <Button
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => openVehicleDialog()}
              >
                <Plus className="h-4 w-4" />
                {t("suppliers.addVehicle")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                    <SortableHeader label={t("vehicles.plateNumber")} sortKey="plateNumber" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                    <TableHead className="text-white text-xs">{t("vehicles.type")}</TableHead>
                    <SortableHeader label={t("vehicles.carBrand")} sortKey="carBrand" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                    <TableHead className="text-white text-xs">{t("vehicles.carModel")}</TableHead>
                    <TableHead className="text-white text-xs">{t("vehicles.makeYear")}</TableHead>
                    <TableHead className="text-white text-xs">{t("vehicles.ownership")}</TableHead>
                    <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-right text-white text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVehicles.map((vehicle, idx) => (
                    <TableRow
                      key={vehicle.id}
                      className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                    >
                      <TableCell className="font-mono font-medium text-foreground">
                        {vehicle.plateNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.vehicleType?.name || "-"}
                        {vehicle.vehicleType && (
                          <span className="ml-1 text-xs text-muted-foreground/60">
                            ({vehicle.vehicleType.seatCapacity})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.carBrand || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.carModel || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.makeYear || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {vehicle.ownership}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => handleToggleVehicleStatus(vehicle.id)} className="cursor-pointer">
                          {vehicle.isActive ? (
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openVehicleDialog(vehicle)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Drivers Tab ── */}
        <TabsContent value="drivers" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
              {t("suppliers.drivers")}
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportDrivers}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Download className="h-4 w-4" />
                {t("common.export")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadDriverTemplate}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {t("common.template")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".xlsx,.xls";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleImportDrivers(file);
                  };
                  input.click();
                }}
              >
                <Upload className="h-4 w-4" />
                {t("common.import")}
              </Button>
              <Button
                onClick={() => openDriverDialog()}
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {t("suppliers.addDriver")}
              </Button>
            </div>
          </div>

          {driversLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserRound className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("suppliers.noDrivers")}
              </p>
              <Button
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => openDriverDialog()}
              >
                <Plus className="h-4 w-4" />
                {t("suppliers.addDriver")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                    <SortableHeader label={t("suppliers.driverName")} sortKey="name" currentKey={driverSortKey} currentDir={driverSortDir} onSort={onDriverSort} />
                    <SortableHeader label={t("suppliers.mobileNumber")} sortKey="mobileNumber" currentKey={driverSortKey} currentDir={driverSortDir} onSort={onDriverSort} />
                    <TableHead className="text-white text-xs">{t("suppliers.licenseNumber")}</TableHead>
                    <SortableHeader label={t("suppliers.licenseExpiry")} sortKey="licenseExpiryDate" currentKey={driverSortKey} currentDir={driverSortDir} onSort={onDriverSort} />
                    <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-right text-white text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDrivers.map((driver, idx) => (
                    <TableRow
                      key={driver.id}
                      className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                    >
                      <TableCell className="font-medium text-foreground">
                        {driver.name}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {driver.mobileNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {driver.licenseNumber || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {driver.licenseExpiryDate
                          ? new Date(driver.licenseExpiryDate).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <button onClick={() => handleToggleDriverStatus(driver.id)} className="cursor-pointer">
                          {driver.isActive ? (
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openDriverDialog(driver)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteDriver(driver.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Price List Tab ── */}
        <TabsContent value="prices" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPriceList}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              {t("common.export")}
            </Button>
          </div>
          {priceLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PriceListGrid
              items={priceItems}
              vehicleTypes={vehicleTypes as PriceGridVehicleType[]}
              priceFieldName="price"
              onSave={handleSavePriceList}
              onDeleteRoute={handleDeletePriceRoute}
              onRefresh={fetchPriceList}
              onDownloadTemplate={handleDownloadPriceListTemplate}
              onImport={handleImportPriceList}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* ── Driver Dialog ── */}
      <Dialog
        open={driverDialogOpen}
        onOpenChange={(open) => {
          setDriverDialogOpen(open);
          if (!open) resetDriverForm();
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingDriver ? t("suppliers.editDriver") : t("suppliers.addDriver")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("suppliers.driverName")} *</Label>
              <Input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Ahmed Mohamed"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("suppliers.mobileNumber")} *</Label>
              <Input
                value={driverMobile}
                onChange={(e) => setDriverMobile(e.target.value)}
                placeholder="+20 100 000 0000"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("suppliers.licenseNumber")}</Label>
              <Input
                value={driverLicense}
                onChange={(e) => setDriverLicense(e.target.value)}
                placeholder="DL-12345"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("suppliers.licenseExpiry")}</Label>
              <Input
                type="date"
                value={driverLicenseExpiry}
                onChange={(e) => setDriverLicenseExpiry(e.target.value)}
                className="border-border bg-card text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDriverDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleDriverSubmit}
              disabled={driverSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {driverSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingDriver ? t("common.saveChanges") : t("suppliers.addDriver")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Vehicle Dialog ── */}
      <Dialog
        open={vehicleDialogOpen}
        onOpenChange={(open) => {
          setVehicleDialogOpen(open);
          if (!open) resetVehicleForm();
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingVehicle ? t("suppliers.editVehicle") : t("suppliers.addVehicle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.plateNumber")} *</Label>
              <Input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="ABC-1234"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.type")} *</Label>
              <Select value={vehicleTypeId} onValueChange={setVehicleTypeId}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("vehicles.selectType")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {vehicleTypes.map((vt) => (
                    <SelectItem key={vt.id} value={vt.id}>
                      {vt.name} ({vt.seatCapacity} pax)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.ownership")}</Label>
              <Select value={ownership} onValueChange={setOwnership}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {OWNERSHIP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.color")}</Label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="White"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.carBrand")}</Label>
              <Input
                value={carBrand}
                onChange={(e) => setCarBrand(e.target.value)}
                placeholder="Toyota"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.carModel")}</Label>
              <Input
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
                placeholder="Hiace"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.makeYear")}</Label>
              <Input
                type="number"
                value={makeYear}
                onChange={(e) => setMakeYear(e.target.value)}
                placeholder="2024"
                className="border-border bg-card text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("vehicles.luggageCapacity")}</Label>
              <Input
                type="number"
                value={luggageCapacity}
                onChange={(e) => setLuggageCapacity(e.target.value)}
                placeholder="0"
                className="border-border bg-card text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setVehicleDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleVehicleSubmit}
              disabled={vehicleSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {vehicleSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingVehicle ? t("common.saveChanges") : t("suppliers.addVehicle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
