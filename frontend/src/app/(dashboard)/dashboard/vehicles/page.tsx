"use client";

import { useEffect, useState, useCallback } from "react";
import { Car, Plus, Loader2 } from "lucide-react";
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
import api from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────
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
  ownership: "OWNED" | "RENTED" | "CONTRACTED";
  isActive: boolean;
}

interface VehiclesResponse {
  data: Vehicle[];
  total: number;
  page: number;
  limit: number;
}

// ─── Main Page ───────────────────────────────────────────────────
export default function VehiclesPage() {
  const [activeTab, setActiveTab] = useState("types");

  // Vehicle Types state
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeSeatCapacity, setTypeSeatCapacity] = useState("");

  // Vehicles state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [ownership, setOwnership] = useState("");

  // ─── Fetch Vehicle Types ────────────────────────────────────────
  const fetchTypes = useCallback(async () => {
    setTypesLoading(true);
    try {
      const { data } = await api.get("/vehicles/types");
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load vehicle types");
    } finally {
      setTypesLoading(false);
    }
  }, []);

  // ─── Fetch Vehicles ────────────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const { data } = await api.get<VehiclesResponse>("/vehicles");
      setVehicles(Array.isArray(data.data) ? data.data : []);
    } catch {
      toast.error("Failed to load vehicles");
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
    fetchVehicles();
  }, [fetchTypes, fetchVehicles]);

  // ─── Create Vehicle Type ────────────────────────────────────────
  const handleCreateType = async () => {
    if (!typeName.trim()) {
      toast.error("Name is required");
      return;
    }
    const capacity = parseInt(typeSeatCapacity, 10);
    if (!capacity || capacity <= 0) {
      toast.error("Seat capacity must be a positive number");
      return;
    }

    setTypeSubmitting(true);
    try {
      await api.post("/vehicles/types", {
        name: typeName.trim(),
        seatCapacity: capacity,
      });
      toast.success("Vehicle type created successfully");
      setTypeDialogOpen(false);
      resetTypeForm();
      fetchTypes();
    } catch {
      toast.error("Failed to create vehicle type");
    } finally {
      setTypeSubmitting(false);
    }
  };

  // ─── Create Vehicle ────────────────────────────────────────────
  const handleCreateVehicle = async () => {
    if (!plateNumber.trim()) {
      toast.error("Plate number is required");
      return;
    }
    if (!vehicleTypeId) {
      toast.error("Vehicle type is required");
      return;
    }
    if (!ownership) {
      toast.error("Ownership is required");
      return;
    }

    setVehicleSubmitting(true);
    try {
      await api.post("/vehicles", {
        plateNumber: plateNumber.trim(),
        vehicleTypeId,
        ownership,
      });
      toast.success("Vehicle created successfully");
      setVehicleDialogOpen(false);
      resetVehicleForm();
      fetchVehicles();
    } catch {
      toast.error("Failed to create vehicle");
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
  };

  // ─── Resolve type name for vehicles table ──────────────────────
  const getTypeName = (vehicle: Vehicle) => {
    if (vehicle.vehicleType?.name) return vehicle.vehicleType.name;
    const found = types.find((t) => t.id === vehicle.vehicleTypeId);
    return found?.name ?? "Unknown";
  };

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description="Manage vehicle types and fleet vehicles"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="border-border bg-card">
          <TabsTrigger value="types">Vehicle Types</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
        </TabsList>

        {/* ── Vehicle Types Tab ─────────────────────────────────── */}
        <TabsContent value="types" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Define vehicle categories and their seat capacities.
            </p>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setTypeDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Type
            </Button>
          </div>

          <Card className="border-border bg-card">
            {typesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : types.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Car className="mb-2 h-8 w-8" />
                <p className="text-sm">No vehicle types found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">
                      Seat Capacity
                    </TableHead>
                    <TableHead className="text-right text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map((type) => (
                    <TableRow
                      key={type.id}
                      className="border-border hover:bg-accent"
                    >
                      <TableCell className="font-medium text-foreground">
                        {type.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {type.seatCapacity} seats
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
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
        </TabsContent>

        {/* ── Vehicles Tab ──────────────────────────────────────── */}
        <TabsContent value="vehicles" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Fleet vehicles with plate numbers and assignments.
            </p>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setVehicleDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Button>
          </div>

          <Card className="border-border bg-card">
            {vehiclesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : vehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Car className="mb-2 h-8 w-8" />
                <p className="text-sm">No vehicles found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">
                      Plate Number
                    </TableHead>
                    <TableHead className="text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Ownership</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((vehicle) => (
                    <TableRow
                      key={vehicle.id}
                      className="border-border hover:bg-accent"
                    >
                      <TableCell className="font-medium text-foreground">
                        {vehicle.plateNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getTypeName(vehicle)}
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
                        {vehicle.isActive ? (
                          <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-600 dark:text-red-400">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
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
            <DialogTitle>Add Vehicle Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="type-name" className="text-muted-foreground">
                Name
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
                Seat Capacity
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
              Cancel
            </Button>
            <Button
              onClick={handleCreateType}
              disabled={typeSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {typeSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create
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
            <DialogTitle>Add Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="plate-number" className="text-muted-foreground">
                Plate Number
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
                Vehicle Type
              </Label>
              <Select value={vehicleTypeId} onValueChange={setVehicleTypeId}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {types.map((type) => (
                    <SelectItem
                      key={type.id}
                      value={type.id}
                      className="focus:bg-accent focus:text-accent-foreground"
                    >
                      {type.name} ({type.seatCapacity} seats)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership" className="text-muted-foreground">
                Ownership
              </Label>
              <Select value={ownership} onValueChange={setOwnership}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder="Select ownership" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  <SelectItem
                    value="OWNED"
                    className="focus:bg-accent focus:text-accent-foreground"
                  >
                    Owned
                  </SelectItem>
                  <SelectItem
                    value="RENTED"
                    className="focus:bg-accent focus:text-accent-foreground"
                  >
                    Rented
                  </SelectItem>
                  <SelectItem
                    value="CONTRACTED"
                    className="focus:bg-accent focus:text-accent-foreground"
                  >
                    Contracted
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setVehicleDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateVehicle}
              disabled={vehicleSubmitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {vehicleSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
