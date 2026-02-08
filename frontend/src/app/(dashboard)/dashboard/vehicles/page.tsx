"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Car, Plus, Loader2, Trash2, FileDown, FileUp, FileSpreadsheet, AlertTriangle, Upload, ExternalLink } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";
import { TableFilterBar } from "@/components/table-filter-bar";

// ─── Types ───────────────────────────────────────────────────────
interface VehicleType {
  id: string;
  name: string;
  seatCapacity: number;
}

interface VehicleCompliance {
  id: string;
  vehicleId: string;
  licenseExpiryDate: string | null;
  licenseCopyUrl: string | null;
  hasInsurance: boolean;
  insuranceExpiryDate: string | null;
  insuranceDocUrl: string | null;
  annualPayment: number | null;
  annualPaymentCurrency: string | null;
  gpsSubscription: number | null;
  gpsSubscriptionCurrency: string | null;
  tourismSupportFund: number | null;
  tourismSupportFundCurrency: string | null;
  temporaryPermitDate: string | null;
  depositPayment: number | null;
  depositPaymentCurrency: string | null;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleTypeId: string;
  vehicleType?: VehicleType;
  ownership: "OWNED" | "RENTED" | "CONTRACTED";
  color: string | null;
  carBrand: string | null;
  carModel: string | null;
  makeYear: number | null;
  luggageCapacity: number | null;
  isActive: boolean;
  compliance?: VehicleCompliance | null;
}

interface VehiclesResponse {
  data: Vehicle[];
  total: number;
  page: number;
  limit: number;
}

// ─── Main Page ───────────────────────────────────────────────────
export default function VehiclesPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState("types");

  // Vehicle Types state
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editTypeDialogOpen, setEditTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<VehicleType | null>(null);
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeSeatCapacity, setTypeSeatCapacity] = useState("");

  // Vehicles state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editVehicleDialogOpen, setEditVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [ownership, setOwnership] = useState("");
  const [color, setColor] = useState("");
  const [carBrand, setCarBrand] = useState("");
  const [carModel, setCarModel] = useState("");
  const [makeYear, setMakeYear] = useState("");
  const [luggageCapacity, setLuggageCapacity] = useState("");

  // Compliance state
  const [editTab, setEditTab] = useState("details");
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");
  const [licenseCopyUrl, setLicenseCopyUrl] = useState("");
  const [hasInsurance, setHasInsurance] = useState(false);
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState("");
  const [insuranceDocUrl, setInsuranceDocUrl] = useState("");
  const [annualPayment, setAnnualPayment] = useState("");
  const [annualPaymentCurrency, setAnnualPaymentCurrency] = useState("EGP");
  const [gpsSubscription, setGpsSubscription] = useState("");
  const [gpsSubscriptionCurrency, setGpsSubscriptionCurrency] = useState("EGP");
  const [tourismSupportFund, setTourismSupportFund] = useState("");
  const [tourismSupportFundCurrency, setTourismSupportFundCurrency] = useState("EGP");
  const [temporaryPermitDate, setTemporaryPermitDate] = useState("");
  const [depositPayment, setDepositPayment] = useState("");
  const [depositPaymentCurrency, setDepositPaymentCurrency] = useState("EGP");
  const licenseFileRef = useRef<HTMLInputElement>(null);
  const insuranceFileRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import/Export state
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    open: boolean;
    imported: number;
    errors: string[];
  }>({ open: false, imported: 0, errors: [] });

  // Search & sorting for types
  const [typeSearch, setTypeSearch] = useState("");
  const filteredTypes = useMemo(() => {
    if (!typeSearch.trim()) return types;
    const q = typeSearch.toLowerCase();
    return types.filter((t) => t.name.toLowerCase().includes(q));
  }, [types, typeSearch]);
  const { sortedData: sortedTypes, sortKey: typeSortKey, sortDir: typeSortDir, onSort: onTypeSort } = useSortable<VehicleType>(filteredTypes);

  // Search & sorting for vehicles
  const [vehicleSearch, setVehicleSearch] = useState("");
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;
    const q = vehicleSearch.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.plateNumber.toLowerCase().includes(q) ||
        (v.vehicleType?.name && v.vehicleType.name.toLowerCase().includes(q))
    );
  }, [vehicles, vehicleSearch]);
  const { sortedData: sortedVehicles, sortKey: vehicleSortKey, sortDir: vehicleSortDir, onSort: onVehicleSort } = useSortable<Vehicle>(filteredVehicles);

  // ─── Fetch Vehicle Types ────────────────────────────────────────
  const fetchTypes = useCallback(async () => {
    setTypesLoading(true);
    try {
      const { data } = await api.get("/vehicles/types");
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("vehicles.failedLoadTypes"));
    } finally {
      setTypesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fetch Vehicles ────────────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const { data } = await api.get<VehiclesResponse>("/vehicles");
      setVehicles(Array.isArray(data.data) ? data.data : []);
    } catch {
      toast.error(t("vehicles.failedLoadVehicles"));
    } finally {
      setVehiclesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchTypes();
    fetchVehicles();
  }, [fetchTypes, fetchVehicles]);

  // ─── Create Vehicle Type ────────────────────────────────────────
  const handleCreateType = async () => {
    if (!typeName.trim()) {
      toast.error(t("vehicles.nameRequired"));
      return;
    }
    const capacity = parseInt(typeSeatCapacity, 10);
    if (!capacity || capacity <= 0) {
      toast.error(t("vehicles.seatCapacityPositive"));
      return;
    }

    setTypeSubmitting(true);
    try {
      await api.post("/vehicles/types", {
        name: typeName.trim(),
        seatCapacity: capacity,
      });
      toast.success(t("vehicles.typeCreated"));
      setTypeDialogOpen(false);
      resetTypeForm();
      fetchTypes();
    } catch {
      toast.error(t("vehicles.failedCreateType"));
    } finally {
      setTypeSubmitting(false);
    }
  };

  // ─── Create Vehicle ────────────────────────────────────────────
  const handleCreateVehicle = async () => {
    if (!plateNumber.trim()) {
      toast.error(t("vehicles.plateRequired"));
      return;
    }
    if (!vehicleTypeId) {
      toast.error(t("vehicles.typeRequired"));
      return;
    }
    if (!ownership) {
      toast.error(t("vehicles.ownershipRequired"));
      return;
    }

    setVehicleSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        plateNumber: plateNumber.trim(),
        vehicleTypeId,
        ownership,
      };
      if (color) payload.color = color;
      if (carBrand.trim()) payload.carBrand = carBrand.trim();
      if (carModel.trim()) payload.carModel = carModel.trim();
      if (makeYear) payload.makeYear = parseInt(makeYear, 10);
      if (luggageCapacity) payload.luggageCapacity = parseInt(luggageCapacity, 10);
      await api.post("/vehicles", payload);
      toast.success(t("vehicles.vehicleCreated"));
      setVehicleDialogOpen(false);
      resetVehicleForm();
      fetchVehicles();
    } catch {
      toast.error(t("vehicles.failedCreateVehicle"));
    } finally {
      setVehicleSubmitting(false);
    }
  };

  // ─── Edit Vehicle Type ─────────────────────────────────────────
  function openEditTypeDialog(type: VehicleType) {
    setEditingType(type);
    setTypeName(type.name);
    setTypeSeatCapacity(String(type.seatCapacity));
    setEditTypeDialogOpen(true);
  }

  const handleUpdateType = async () => {
    if (!editingType) return;
    if (!typeName.trim()) {
      toast.error(t("vehicles.nameRequired"));
      return;
    }
    const capacity = parseInt(typeSeatCapacity, 10);
    if (!capacity || capacity <= 0) {
      toast.error(t("vehicles.seatCapacityPositive"));
      return;
    }

    setTypeSubmitting(true);
    try {
      await api.patch(`/vehicles/types/${editingType.id}`, {
        name: typeName.trim(),
        seatCapacity: capacity,
      });
      toast.success(t("vehicles.typeUpdated"));
      setEditTypeDialogOpen(false);
      setEditingType(null);
      resetTypeForm();
      fetchTypes();
    } catch {
      toast.error(t("vehicles.failedUpdateType"));
    } finally {
      setTypeSubmitting(false);
    }
  };

  // ─── Edit Vehicle ────────────────────────────────────────────
  function openEditVehicleDialog(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    setPlateNumber(vehicle.plateNumber);
    setVehicleTypeId(vehicle.vehicleTypeId);
    setOwnership(vehicle.ownership);
    setColor(vehicle.color || "");
    setCarBrand(vehicle.carBrand || "");
    setCarModel(vehicle.carModel || "");
    setMakeYear(vehicle.makeYear != null ? String(vehicle.makeYear) : "");
    setLuggageCapacity(vehicle.luggageCapacity != null ? String(vehicle.luggageCapacity) : "");
    setEditTab("details");
    resetComplianceForm();
    // Load compliance data
    loadCompliance(vehicle.id);
    setEditVehicleDialogOpen(true);
  }

  async function loadCompliance(vehicleId: string) {
    setComplianceLoading(true);
    try {
      const { data } = await api.get(`/vehicles/${vehicleId}/compliance`);
      const c = data?.data;
      if (c) {
        setLicenseExpiryDate(c.licenseExpiryDate ? c.licenseExpiryDate.split("T")[0] : "");
        setLicenseCopyUrl(c.licenseCopyUrl || "");
        setHasInsurance(c.hasInsurance ?? false);
        setInsuranceExpiryDate(c.insuranceExpiryDate ? c.insuranceExpiryDate.split("T")[0] : "");
        setInsuranceDocUrl(c.insuranceDocUrl || "");
        setAnnualPayment(c.annualPayment != null ? String(c.annualPayment) : "");
        setAnnualPaymentCurrency(c.annualPaymentCurrency || "EGP");
        setGpsSubscription(c.gpsSubscription != null ? String(c.gpsSubscription) : "");
        setGpsSubscriptionCurrency(c.gpsSubscriptionCurrency || "EGP");
        setTourismSupportFund(c.tourismSupportFund != null ? String(c.tourismSupportFund) : "");
        setTourismSupportFundCurrency(c.tourismSupportFundCurrency || "EGP");
        setTemporaryPermitDate(c.temporaryPermitDate ? c.temporaryPermitDate.split("T")[0] : "");
        setDepositPayment(c.depositPayment != null ? String(c.depositPayment) : "");
        setDepositPaymentCurrency(c.depositPaymentCurrency || "EGP");
      }
    } catch {
      // No compliance data yet - form stays empty
    } finally {
      setComplianceLoading(false);
    }
  }

  async function handleSaveCompliance() {
    if (!editingVehicle) return;
    setComplianceSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (licenseExpiryDate) payload.licenseExpiryDate = licenseExpiryDate;
      payload.hasInsurance = hasInsurance;
      if (hasInsurance && insuranceExpiryDate) payload.insuranceExpiryDate = insuranceExpiryDate;
      if (gpsSubscription) {
        payload.gpsSubscription = parseFloat(gpsSubscription);
        payload.gpsSubscriptionCurrency = gpsSubscriptionCurrency;
      }
      if (tourismSupportFund) {
        payload.tourismSupportFund = parseFloat(tourismSupportFund);
        payload.tourismSupportFundCurrency = tourismSupportFundCurrency;
      }
      if (temporaryPermitDate) payload.temporaryPermitDate = temporaryPermitDate;
      // Only include contracted-specific fields for CONTRACTED ownership
      if (ownership === "CONTRACTED") {
        if (annualPayment) {
          payload.annualPayment = parseFloat(annualPayment);
          payload.annualPaymentCurrency = annualPaymentCurrency;
        }
        if (depositPayment) {
          payload.depositPayment = parseFloat(depositPayment);
          payload.depositPaymentCurrency = depositPaymentCurrency;
        }
      }
      await api.patch(`/vehicles/${editingVehicle.id}/compliance`, payload);
      toast.success(t("vehicles.complianceSaved"));
    } catch {
      toast.error(t("vehicles.failedSaveCompliance"));
    } finally {
      setComplianceSaving(false);
    }
  }

  async function handleUploadFile(vehicleId: string, type: "license" | "insurance", file: File) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post(`/vehicles/${vehicleId}/compliance/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (type === "license") setLicenseCopyUrl(data.url);
      else setInsuranceDocUrl(data.url);
      toast.success(t("vehicles.fileUploaded"));
    } catch {
      toast.error(t("vehicles.failedUpload"));
    }
  }

  const handleUpdateVehicle = async () => {
    if (!editingVehicle) return;
    if (!plateNumber.trim()) {
      toast.error(t("vehicles.plateRequired"));
      return;
    }
    if (!vehicleTypeId) {
      toast.error(t("vehicles.typeRequired"));
      return;
    }
    if (!ownership) {
      toast.error(t("vehicles.ownershipRequired"));
      return;
    }

    setVehicleSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        plateNumber: plateNumber.trim(),
        vehicleTypeId,
        ownership,
      };
      if (color) payload.color = color;
      if (carBrand.trim()) payload.carBrand = carBrand.trim();
      if (carModel.trim()) payload.carModel = carModel.trim();
      if (makeYear) payload.makeYear = parseInt(makeYear, 10);
      if (luggageCapacity) payload.luggageCapacity = parseInt(luggageCapacity, 10);
      await api.patch(`/vehicles/${editingVehicle.id}`, payload);
      toast.success(t("vehicles.vehicleUpdated"));
      setEditVehicleDialogOpen(false);
      setEditingVehicle(null);
      resetVehicleForm();
      fetchVehicles();
    } catch {
      toast.error(t("vehicles.failedUpdateVehicle"));
    } finally {
      setVehicleSubmitting(false);
    }
  };

  // ─── Form Resets ────────────────────────────────────────────────
  const resetTypeForm = () => {
    setTypeName("");
    setTypeSeatCapacity("");
  };

  const resetVehicleForm = () => {
    setPlateNumber("");
    setVehicleTypeId("");
    setOwnership("");
    setColor("");
    setCarBrand("");
    setCarModel("");
    setMakeYear("");
    setLuggageCapacity("");
  };

  const resetComplianceForm = () => {
    setLicenseExpiryDate("");
    setLicenseCopyUrl("");
    setHasInsurance(false);
    setInsuranceExpiryDate("");
    setInsuranceDocUrl("");
    setAnnualPayment("");
    setAnnualPaymentCurrency("EGP");
    setGpsSubscription("");
    setGpsSubscriptionCurrency("EGP");
    setTourismSupportFund("");
    setTourismSupportFundCurrency("EGP");
    setTemporaryPermitDate("");
    setDepositPayment("");
    setDepositPaymentCurrency("EGP");
  };

  // ─── Permit expiry computation ─────────────────────────────────
  const permitExpiry = useMemo(() => {
    if (!temporaryPermitDate) return null;
    const d = new Date(temporaryPermitDate);
    d.setMonth(d.getMonth() + 3);
    return d;
  }, [temporaryPermitDate]);

  const permitStatus = useMemo(() => {
    if (!permitExpiry) return null;
    const now = new Date();
    if (permitExpiry < now) return "expired";
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
    if (permitExpiry < oneMonthFromNow) return "warning";
    return "valid";
  }, [permitExpiry]);

  const balanceRemaining = useMemo(() => {
    const annual = parseFloat(annualPayment) || 0;
    const deposit = parseFloat(depositPayment) || 0;
    return annual - deposit;
  }, [annualPayment, depositPayment]);

  const currencies = ["EGP", "USD", "EUR", "GBP", "SAR"];

  // ─── Resolve type name for vehicles table ──────────────────────
  const getTypeName = (vehicle: Vehicle) => {
    if (vehicle.vehicleType?.name) return vehicle.vehicleType.name;
    const found = types.find((tp) => tp.id === vehicle.vehicleTypeId);
    return found?.name ?? "Unknown";
  };

  // ─── Toggle Vehicle Status ───────────────────────────────────
  async function handleToggleStatus(id: string) {
    try {
      await api.patch(`/vehicles/${id}/status`);
      setVehicles((prev) =>
        prev.map((v) => (v.id === id ? { ...v, isActive: !v.isActive } : v))
      );
      toast.success(t("common.statusUpdated"));
    } catch {
      toast.error(t("common.failedStatusUpdate"));
    }
  }

  // ─── Delete Vehicle ──────────────────────────────────────────
  function openDeleteDialog(vehicle: Vehicle) {
    setDeletingVehicle(vehicle);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingVehicle) return;
    try {
      setDeleting(true);
      await api.delete(`/vehicles/${deletingVehicle.id}`);
      toast.success(t("vehicles.deleted"));
      setDeleteDialogOpen(false);
      setDeletingVehicle(null);
      fetchVehicles();
    } catch {
      toast.error(t("vehicles.failedDelete"));
    } finally {
      setDeleting(false);
    }
  }

  // ─── Export / Import ──────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get("/vehicles/export/excel", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `vehicles_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t("vehicles.exportSuccess"));
    } catch {
      toast.error(t("vehicles.failedExport"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const res = await api.get("/vehicles/import/template", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "vehicles_import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("vehicles.failedTemplate"));
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/vehicles/import/excel", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const result = res.data.data;
      setImportResult({
        open: true,
        imported: result.imported,
        errors: result.errors,
      });
      if (result.imported > 0) {
        fetchVehicles();
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("vehicles.failedImport");
      toast.error(message);
    } finally {
      setImporting(false);
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
    }
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("vehicles.title")}
        description={t("vehicles.description")}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="border-border bg-card">
          <TabsTrigger value="types">{t("vehicles.vehicleTypes")}</TabsTrigger>
          <TabsTrigger value="vehicles">{t("vehicles.title")}</TabsTrigger>
        </TabsList>

        {/* ── Vehicle Types Tab ─────────────────────────────────── */}
        <TabsContent value="types" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("vehicles.typesDescription")}
            </p>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setTypeDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("vehicles.addType")}
            </Button>
          </div>

          {typesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : types.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Car className="mb-2 h-8 w-8" />
              <p className="text-sm">{t("vehicles.noTypes")}</p>
            </div>
          ) : (
            <>
              <TableFilterBar
                search={typeSearch}
                onSearchChange={setTypeSearch}
                placeholder={t("common.search") + "..."}
              />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("common.name")} sortKey="name" currentKey={typeSortKey} currentDir={typeSortDir} onSort={onTypeSort} />
                      <SortableHeader label={t("vehicles.seatCapacity")} sortKey="seatCapacity" currentKey={typeSortKey} currentDir={typeSortDir} onSort={onTypeSort} />
                      <TableHead className="text-right text-white text-xs">
                        {t("common.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTypes.map((type, idx) => (
                    <TableRow
                      key={type.id}
                      className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                    >
                      <TableCell className="font-medium text-foreground">
                        {type.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {type.seatCapacity} {t("vehicles.seats")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => openEditTypeDialog(type)}
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
        </TabsContent>

        {/* ── Vehicles Tab ──────────────────────────────────────── */}
        <TabsContent value="vehicles" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("vehicles.vehiclesDescription")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleDownloadTemplate}
              >
                <FileDown className="h-4 w-4" />
                {t("common.template")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                {t("common.import")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                {t("common.export")}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setVehicleDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t("vehicles.addVehicle")}
              </Button>
            </div>
          </div>

          {/* Hidden file input for import */}
          <input
            ref={importFileRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls"
            onChange={handleImportFile}
          />

          {vehiclesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Car className="mb-2 h-8 w-8" />
              <p className="text-sm">{t("vehicles.noVehicles")}</p>
            </div>
          ) : (
            <>
              <TableFilterBar
                search={vehicleSearch}
                onSearchChange={setVehicleSearch}
                placeholder={t("common.search") + "..."}
              />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("vehicles.plateNumber")} sortKey="plateNumber" currentKey={vehicleSortKey} currentDir={vehicleSortDir} onSort={onVehicleSort} />
                      <SortableHeader label={t("vehicles.type")} sortKey="vehicleType.name" currentKey={vehicleSortKey} currentDir={vehicleSortDir} onSort={onVehicleSort} />
                      <TableHead className="text-white text-xs">{t("vehicles.color")}</TableHead>
                      <TableHead className="text-white text-xs">{t("vehicles.carBrand")}</TableHead>
                      <TableHead className="text-white text-xs">{t("vehicles.carModel")}</TableHead>
                      <TableHead className="text-white text-xs">{t("vehicles.makeYear")}</TableHead>
                      <TableHead className="text-white text-xs">{t("vehicles.luggageCapacity")}</TableHead>
                      <TableHead className="text-white text-xs">{t("vehicles.ownership")}</TableHead>
                      <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                      <TableHead className="text-right text-white text-xs">
                        {t("common.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedVehicles.map((vehicle, idx) => (
                    <TableRow
                      key={vehicle.id}
                      className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                    >
                      <TableCell className="font-medium text-foreground">
                        {vehicle.plateNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getTypeName(vehicle)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.color || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.carBrand || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.carModel || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.makeYear ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vehicle.luggageCapacity != null ? vehicle.luggageCapacity : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-secondary text-muted-foreground"
                        >
                          {vehicle.ownership}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => handleToggleStatus(vehicle.id)} className="cursor-pointer">
                          {vehicle.isActive ? (
                            <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                              {t("common.active")}
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 transition-colors">
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
                          onClick={() => openEditVehicleDialog(vehicle)}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground hover:text-red-600"
                          onClick={() => openDeleteDialog(vehicle)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add Vehicle Type Dialog ────────────────────────────── */}
      <Dialog
        open={typeDialogOpen}
        onOpenChange={(open) => {
          setTypeDialogOpen(open);
          if (!open) resetTypeForm();
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>{t("vehicles.addVehicleType")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="type-name" className="text-muted-foreground">
                {t("common.name")}
              </Label>
              <Input
                id="type-name"
                placeholder="e.g. Sedan, Minibus, Coaster"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-capacity" className="text-muted-foreground">
                {t("vehicles.seatCapacity")}
              </Label>
              <Input
                id="type-capacity"
                type="number"
                min={1}
                placeholder="e.g. 4"
                value={typeSeatCapacity}
                onChange={(e) => setTypeSeatCapacity(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTypeDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateType}
              disabled={typeSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {typeSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Results Dialog ─────────────────────────────── */}
      <Dialog
        open={importResult.open}
        onOpenChange={(open) => {
          if (!open) setImportResult({ open: false, imported: 0, errors: [] });
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("vehicles.importResults")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {importResult.imported} {t("vehicles.imported")}
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {importResult.errors.length} {t("vehicles.errors")}
                  </p>
                )}
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                  Errors
                </p>
                <ul className="space-y-1">
                  {importResult.errors.map((err, i) => (
                    <li
                      key={i}
                      className="text-xs text-destructive flex items-start gap-1.5"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                setImportResult({ open: false, imported: 0, errors: [] })
              }
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Vehicle Confirmation Dialog ─────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) setDeletingVehicle(null);
      }}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("vehicles.deleteVehicle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t("vehicles.deleteConfirm")} <span className="font-medium text-foreground">{deletingVehicle?.plateNumber}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              {t("vehicles.deleteNote")}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
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

      {/* ── Add Vehicle Dialog ────────────────────────────────── */}
      <Dialog
        open={vehicleDialogOpen}
        onOpenChange={(open) => {
          setVehicleDialogOpen(open);
          if (!open) resetVehicleForm();
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>{t("vehicles.addVehicle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="plate-number" className="text-muted-foreground">
                {t("vehicles.plateNumber")}
              </Label>
              <Input
                id="plate-number"
                placeholder="e.g. ABC-1234"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-type" className="text-muted-foreground">
                {t("vehicles.type")}
              </Label>
              <Select value={vehicleTypeId} onValueChange={setVehicleTypeId}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("vehicles.selectType")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {types.map((type) => (
                    <SelectItem
                      key={type.id}
                      value={type.id}
                      className="focus:bg-accent focus:text-accent-foreground"
                    >
                      {type.name} ({type.seatCapacity} {t("vehicles.seats")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership" className="text-muted-foreground">
                {t("vehicles.ownership")}
              </Label>
              <Select value={ownership} onValueChange={setOwnership}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("vehicles.selectOwnership")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  <SelectItem
                    value="OWNED"
                    className="focus:bg-accent focus:text-accent-foreground"
                  >
                    {t("vehicles.owned")}
                  </SelectItem>
                  <SelectItem
                    value="RENTED"
                    className="focus:bg-accent focus:text-accent-foreground"
                  >
                    {t("vehicles.rented")}
                  </SelectItem>
                  <SelectItem
                    value="CONTRACTED"
                    className="focus:bg-accent focus:text-accent-foreground"
                  >
                    {t("vehicles.contracted")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="color" className="text-muted-foreground">
                {t("vehicles.color")}
              </Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("vehicles.selectColor")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {["White", "Black", "Silver", "Gray", "Red", "Blue", "Green", "Yellow", "Orange", "Brown", "Beige", "Gold", "Maroon", "Navy", "Burgundy"].map((c) => (
                    <SelectItem
                      key={c}
                      value={c}
                      className="focus:bg-accent focus:text-accent-foreground"
                    >
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="car-brand" className="text-muted-foreground">
                  {t("vehicles.carBrand")}
                </Label>
                <Input
                  id="car-brand"
                  placeholder="e.g. Toyota"
                  value={carBrand}
                  onChange={(e) => setCarBrand(e.target.value)}
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="car-model" className="text-muted-foreground">
                  {t("vehicles.carModel")}
                </Label>
                <Input
                  id="car-model"
                  placeholder="e.g. Hiace"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="make-year" className="text-muted-foreground">
                  {t("vehicles.makeYear")}
                </Label>
                <Input
                  id="make-year"
                  type="number"
                  min={1900}
                  max={2100}
                  placeholder="e.g. 2023"
                  value={makeYear}
                  onChange={(e) => setMakeYear(e.target.value)}
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="luggage-capacity" className="text-muted-foreground">
                  {t("vehicles.luggageCapacity")}
                </Label>
                <Input
                  id="luggage-capacity"
                  type="number"
                  min={0}
                  placeholder="e.g. 4"
                  value={luggageCapacity}
                  onChange={(e) => setLuggageCapacity(e.target.value)}
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
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
              onClick={handleCreateVehicle}
              disabled={vehicleSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {vehicleSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Vehicle Type Dialog ─────────────────────────── */}
      <Dialog
        open={editTypeDialogOpen}
        onOpenChange={(open) => {
          setEditTypeDialogOpen(open);
          if (!open) setEditingType(null);
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>{t("vehicles.editType")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-type-name" className="text-muted-foreground">
                {t("common.name")}
              </Label>
              <Input
                id="edit-type-name"
                placeholder="e.g. Sedan, Minibus, Coaster"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type-capacity" className="text-muted-foreground">
                {t("vehicles.seatCapacity")}
              </Label>
              <Input
                id="edit-type-capacity"
                type="number"
                min={1}
                placeholder="e.g. 4"
                value={typeSeatCapacity}
                onChange={(e) => setTypeSeatCapacity(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditTypeDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleUpdateType}
              disabled={typeSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {typeSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Vehicle Dialog (with Compliance tab) ────────── */}
      <Dialog
        open={editVehicleDialogOpen}
        onOpenChange={(open) => {
          setEditVehicleDialogOpen(open);
          if (!open) { setEditingVehicle(null); resetComplianceForm(); }
        }}
      >
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("vehicles.editVehicle")}</DialogTitle>
          </DialogHeader>

          <Tabs value={editTab} onValueChange={setEditTab}>
            <TabsList className="border-border bg-card w-full">
              <TabsTrigger value="details" className="flex-1">{t("vehicles.details")}</TabsTrigger>
              <TabsTrigger value="compliance" className="flex-1">{t("vehicles.compliance")}</TabsTrigger>
            </TabsList>

            {/* ── Details Tab ── */}
            <TabsContent value="details" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-plate-number" className="text-muted-foreground">{t("vehicles.plateNumber")}</Label>
                <Input id="edit-plate-number" placeholder="e.g. ABC-1234" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} className="border-border bg-card text-foreground placeholder:text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vehicle-type" className="text-muted-foreground">{t("vehicles.type")}</Label>
                <Select value={vehicleTypeId} onValueChange={setVehicleTypeId}>
                  <SelectTrigger className="border-border bg-card text-foreground"><SelectValue placeholder={t("vehicles.selectType")} /></SelectTrigger>
                  <SelectContent className="border-border bg-popover text-foreground">
                    {types.map((type) => (<SelectItem key={type.id} value={type.id} className="focus:bg-accent focus:text-accent-foreground">{type.name} ({type.seatCapacity} {t("vehicles.seats")})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ownership" className="text-muted-foreground">{t("vehicles.ownership")}</Label>
                <Select value={ownership} onValueChange={setOwnership}>
                  <SelectTrigger className="border-border bg-card text-foreground"><SelectValue placeholder={t("vehicles.selectOwnership")} /></SelectTrigger>
                  <SelectContent className="border-border bg-popover text-foreground">
                    <SelectItem value="OWNED" className="focus:bg-accent focus:text-accent-foreground">{t("vehicles.owned")}</SelectItem>
                    <SelectItem value="RENTED" className="focus:bg-accent focus:text-accent-foreground">{t("vehicles.rented")}</SelectItem>
                    <SelectItem value="CONTRACTED" className="focus:bg-accent focus:text-accent-foreground">{t("vehicles.contracted")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-color" className="text-muted-foreground">{t("vehicles.color")}</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger className="border-border bg-card text-foreground"><SelectValue placeholder={t("vehicles.selectColor")} /></SelectTrigger>
                  <SelectContent className="border-border bg-popover text-foreground">
                    {["White", "Black", "Silver", "Gray", "Red", "Blue", "Green", "Yellow", "Orange", "Brown", "Beige", "Gold", "Maroon", "Navy", "Burgundy"].map((c) => (<SelectItem key={c} value={c} className="focus:bg-accent focus:text-accent-foreground">{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-car-brand" className="text-muted-foreground">{t("vehicles.carBrand")}</Label>
                  <Input id="edit-car-brand" placeholder="e.g. Toyota" value={carBrand} onChange={(e) => setCarBrand(e.target.value)} className="border-border bg-card text-foreground placeholder:text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-car-model" className="text-muted-foreground">{t("vehicles.carModel")}</Label>
                  <Input id="edit-car-model" placeholder="e.g. Hiace" value={carModel} onChange={(e) => setCarModel(e.target.value)} className="border-border bg-card text-foreground placeholder:text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-make-year" className="text-muted-foreground">{t("vehicles.makeYear")}</Label>
                  <Input id="edit-make-year" type="number" min={1900} max={2100} placeholder="e.g. 2023" value={makeYear} onChange={(e) => setMakeYear(e.target.value)} className="border-border bg-card text-foreground placeholder:text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-luggage-capacity" className="text-muted-foreground">{t("vehicles.luggageCapacity")}</Label>
                  <Input id="edit-luggage-capacity" type="number" min={0} placeholder="e.g. 4" value={luggageCapacity} onChange={(e) => setLuggageCapacity(e.target.value)} className="border-border bg-card text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditVehicleDialogOpen(false)} className="text-muted-foreground hover:text-foreground">{t("common.cancel")}</Button>
                <Button onClick={handleUpdateVehicle} disabled={vehicleSubmitting} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  {vehicleSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.saveChanges")}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* ── Compliance Tab ── */}
            <TabsContent value="compliance" className="mt-4 space-y-5">
              {complianceLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* License Section */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">{t("vehicles.licenseExpiryDate")}</Label>
                      <Input type="date" value={licenseExpiryDate} onChange={(e) => setLicenseExpiryDate(e.target.value)} className="border-border bg-card text-foreground" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">{t("vehicles.uploadLicense")}</Label>
                      <div className="flex items-center gap-2">
                        <input ref={licenseFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f && editingVehicle) handleUploadFile(editingVehicle.id, "license", f); if (licenseFileRef.current) licenseFileRef.current.value = ""; }} />
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => licenseFileRef.current?.click()}>
                          <Upload className="h-4 w-4" /> {t("common.upload")}
                        </Button>
                        {licenseCopyUrl && (
                          <a href={licenseCopyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> {t("vehicles.viewFile")}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Insurance Section */}
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-muted-foreground">{t("vehicles.hasInsurance")}</Label>
                      <Switch checked={hasInsurance} onCheckedChange={setHasInsurance} />
                    </div>
                    {hasInsurance && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">{t("vehicles.insuranceExpiryDate")}</Label>
                          <Input type="date" value={insuranceExpiryDate} onChange={(e) => setInsuranceExpiryDate(e.target.value)} className="border-border bg-card text-foreground" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">{t("vehicles.uploadInsurance")}</Label>
                          <div className="flex items-center gap-2">
                            <input ref={insuranceFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f && editingVehicle) handleUploadFile(editingVehicle.id, "insurance", f); if (insuranceFileRef.current) insuranceFileRef.current.value = ""; }} />
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => insuranceFileRef.current?.click()}>
                              <Upload className="h-4 w-4" /> {t("common.upload")}
                            </Button>
                            {insuranceDocUrl && (
                              <a href={insuranceDocUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" /> {t("vehicles.viewFile")}
                              </a>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Contract / Financial Section (OWNED or CONTRACTED) */}
                  {(ownership === "CONTRACTED" || ownership === "OWNED") && (
                    <div className="space-y-3 border-t border-border pt-4">
                      <p className="text-sm font-medium text-foreground">{t("vehicles.contractedFields")}</p>

                      {ownership === "CONTRACTED" && (
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">{t("vehicles.annualPayment")}</Label>
                          <div className="flex gap-2">
                            <Input type="number" min={0} value={annualPayment} onChange={(e) => setAnnualPayment(e.target.value)} className="border-border bg-card text-foreground flex-1" placeholder="0.00" />
                            <Select value={annualPaymentCurrency} onValueChange={setAnnualPaymentCurrency}>
                              <SelectTrigger className="border-border bg-card text-foreground w-24"><SelectValue /></SelectTrigger>
                              <SelectContent className="border-border bg-popover text-foreground">
                                {currencies.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className="text-muted-foreground">{t("vehicles.gpsSubscription")}</Label>
                        <div className="flex gap-2">
                          <Input type="number" min={0} value={gpsSubscription} onChange={(e) => setGpsSubscription(e.target.value)} className="border-border bg-card text-foreground flex-1" placeholder="0.00" />
                          <Select value={gpsSubscriptionCurrency} onValueChange={setGpsSubscriptionCurrency}>
                            <SelectTrigger className="border-border bg-card text-foreground w-24"><SelectValue /></SelectTrigger>
                            <SelectContent className="border-border bg-popover text-foreground">
                              {currencies.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-muted-foreground">{t("vehicles.tourismSupportFund")}</Label>
                        <div className="flex gap-2">
                          <Input type="number" min={0} value={tourismSupportFund} onChange={(e) => setTourismSupportFund(e.target.value)} className="border-border bg-card text-foreground flex-1" placeholder="0.00" />
                          <Select value={tourismSupportFundCurrency} onValueChange={setTourismSupportFundCurrency}>
                            <SelectTrigger className="border-border bg-card text-foreground w-24"><SelectValue /></SelectTrigger>
                            <SelectContent className="border-border bg-popover text-foreground">
                              {currencies.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Temporary Permit */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">{t("vehicles.temporaryPermit")}</Label>
                        <Input type="date" value={temporaryPermitDate} onChange={(e) => setTemporaryPermitDate(e.target.value)} className="border-border bg-card text-foreground" />
                        {permitExpiry && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{t("vehicles.permitExpiry")}: {permitExpiry.toLocaleDateString()}</span>
                            {permitStatus === "expired" && (
                              <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 text-xs">{t("vehicles.permitExpired")}</Badge>
                            )}
                            {permitStatus === "warning" && (
                              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">{t("vehicles.permitExpiringSoon")}</Badge>
                            )}
                            {permitStatus === "valid" && (
                              <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">{t("vehicles.permitValid")}</Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {ownership === "CONTRACTED" && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-muted-foreground">{t("vehicles.depositPayment")}</Label>
                            <div className="flex gap-2">
                              <Input type="number" min={0} value={depositPayment} onChange={(e) => setDepositPayment(e.target.value)} className="border-border bg-card text-foreground flex-1" placeholder="0.00" />
                              <Select value={depositPaymentCurrency} onValueChange={setDepositPaymentCurrency}>
                                <SelectTrigger className="border-border bg-card text-foreground w-24"><SelectValue /></SelectTrigger>
                                <SelectContent className="border-border bg-popover text-foreground">
                                  {currencies.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-muted-foreground">{t("vehicles.balanceRemaining")}</Label>
                            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                              {balanceRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {annualPaymentCurrency}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setEditVehicleDialogOpen(false)} className="text-muted-foreground hover:text-foreground">{t("common.cancel")}</Button>
                    <Button onClick={handleSaveCompliance} disabled={complianceSaving} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                      {complianceSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("common.saveChanges")}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
