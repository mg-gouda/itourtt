"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import { usePermission } from "@/hooks/use-permission";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Save,
  Car,
  ChevronDown,
  Check,
  X,
  Loader2,
  Columns3,
  Ban,
  ArrowRightLeft,
  UserRound,
  FileText,
  FileSpreadsheet,
  Palette,
} from "lucide-react";
import { cn, isPastServiceDate } from "@/lib/utils";
import { type JobExtra } from "@/components/job-extras-editor";
import { SERVICE_TYPE_DROPDOWN_OPTIONS } from "@/lib/service-types";
import { DataSheet, type DSColumn } from "@/components/data-sheet";
import { cardColorOf } from "@/lib/card-color";
import { findRmfHotel, legOf, areaRoute, type RmfHotel } from "@/lib/rmf-hotel-match";
import { printReport, downloadBlob } from "@/lib/print-report";
import { useAuthStore } from "@/stores/auth-store";
import { useCompanyStore } from "@/stores/company-store";

/* ────────────────────────────── Types ────────────────────────────── */

interface VehicleType {
  id: string;
  name: string;
  seatCapacity: number;
  /** Supplier car types only: the supplier's row id and the number of cars agreed. */
  supplierCarTypeId?: string;
  quantity?: number;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleTypeId: string;
  vehicleType: VehicleType;
  ownership: string;
  supplierId?: string | null;
  isActive: boolean;
  carBrand?: string | null;
  carModel?: string | null;
  /** Card header colour chosen on the vehicle page (null = automatic). */
  cardColor?: string | null;
  /** Supplier cards: which supplier car type, which of its agreed cars (1..quantity). */
  supplierCarTypeId?: string;
  supplierCarNo?: number;
  quantity?: number;
}

/** A supplier card: "<supplier> · n/qty" for one of the supplier's agreed cars of a type. */
function supplierCardVehicle(
  supplierId: string,
  supplierName: string,
  type: VehicleType,
  supplierCarTypeId: string | undefined,
  n: number,
  qty: number,
): Vehicle {
  return {
    id: `sup_${supplierId}_${type.id}_${n}`,
    plateNumber: `${supplierName} · ${n}/${qty}`,
    vehicleTypeId: type.id,
    vehicleType: type,
    ownership: "CONTRACTED",
    supplierId,
    isActive: true,
    carBrand: null,
    carModel: null,
    supplierCarTypeId,
    supplierCarNo: n,
    quantity: qty,
  };
}

interface Customer {
  id: string;
  legalName: string;
  tradeName?: string | null;
}

interface Driver {
  id: string;
  name: string;
  mobileNumber: string;
  isActive: boolean;
}

interface Supplier {
  id: string;
  legalName: string;
  tradeName?: string | null;
  vehicles?: Vehicle[];
}

interface LocationOption {
  id: string;
  name: string;
}

interface JobRow {
  uid: string; // local row key
  customerId: string;
  customerJobId: string; // customer's own job/booking reference
  bookingNumber: string; // auto-generated after save
  description: string; // origin → destination
  pickUpTime: string; // HH:mm
  driverId: string;
  extras: JobExtra[];
  collectionAmount: string;
  collectionCurrency: string;
  custRepName: string;
  custRepMobile: string;
  /** Free notes (often the hotel); a Marsa Alam hotel named here sets the route. */
  notes: string;
  extraDriverName: string;
  extraDriverPhone: string;
  serviceType: string;
  /** Route (JobServiceType). Picking one fills Type (its default) and the origin / destination. */
  jobServiceTypeId: string;
  status?: string; // job status of a saved job (CANCELLED rows are red)
  // location IDs for API
  originAirportId: string;
  originZoneId: string;
  originHotelId: string;
  destinationAirportId: string;
  destinationZoneId: string;
  destinationHotelId: string;
  paxCount: string;
  // state
  saved: boolean;
  saving: boolean;
  savedJobId?: string;
  /** Saved jobs: their assignment, so the driver / extra driver / car can be changed from the board. */
  assignmentId?: string;
  error?: string;
  /** Highlight colours (saved on the job, seen by everyone): whole row and / or single cells. */
  colors?: JobColors;
}

interface JobColors {
  row?: string;
  cells?: Record<string, string>;
}

/** Light-to-strong highlight swatches for the card colour picker. */
const HIGHLIGHTS = ["#fde047", "#fdba74", "#fca5a5", "#f9a8d4", "#c4b5fd", "#93c5fd", "#67e8f9", "#86efac", "#bef264", "#d6d3d1"];
const hasColors = (c?: JobColors) => !!c && (!!c.row || (!!c.cells && Object.keys(c.cells).length > 0));

interface RouteOption {
  id: string;
  name: string;
  defaultServiceType?: string | null;
  fromZone?: { id: string } | null;
  toZone?: { id: string } | null;
  fromAirport?: { id: string } | null;
  toAirport?: { id: string } | null;
}

interface CarCard {
  vehicle: Vehicle;
  jobs: JobRow[];
  isSupplier: boolean;
}

/** GET /dispatch/main-drivers — a car's main driver (driver page / vehicle page). */
interface MainDriverLink {
  vehicleId: string;
  driverId: string;
  driverName: string;
  driverMobile: string | null;
}

const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR"];


function newJobRow(): JobRow {
  return {
    uid: crypto.randomUUID(),
    customerId: "",
    customerJobId: "",
    bookingNumber: "",
    description: "",
    pickUpTime: "",
    driverId: "",
    extras: [],
    collectionAmount: "",
    collectionCurrency: "EGP",
    custRepName: "",
    custRepMobile: "",
    notes: "",
    extraDriverName: "",
    extraDriverPhone: "",
    serviceType: "ARR",
    jobServiceTypeId: "",
    originAirportId: "",
    originZoneId: "",
    originHotelId: "",
    destinationAirportId: "",
    destinationZoneId: "",
    destinationHotelId: "",
    paxCount: "1",
    saved: false,
    saving: false,
  };
}

/* ────────────────────────── Combobox ────────────────────────── */

function ComboSelect({
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "h-8 w-full justify-between px-2 text-xs font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder || "Select..."}
          </span>
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3 w-3",
                      value === o.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="text-xs">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ────────────────── Multi-Select Cars Combobox ────────────────── */

function MultiSelectCars({
  vehicles,
  selected,
  onChange,
}: {
  vehicles: Vehicle[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const allSelected = selected.size === vehicles.length && vehicles.length > 0;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleAll = () => {
    if (allSelected) onChange(new Set());
    else onChange(new Set(vehicles.map((v) => v.id)));
  };

  const selectedVehicles = vehicles.filter((v) => selected.has(v.id));

  // Select cars by type / category: ticking a type selects all its cars, unticking removes them;
  // the car list beside it still fine-tunes single cars.
  const [typeOpen, setTypeOpen] = useState(false);
  const carTypes = Object.values(
    vehicles.reduce<Record<string, { id: string; name: string; ids: string[] }>>((acc, v) => {
      const id = v.vehicleTypeId || "none";
      (acc[id] ??= { id, name: v.vehicleType?.name || "No type", ids: [] }).ids.push(v.id);
      return acc;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name));
  const toggleType = (ids: string[]) => {
    const next = new Set(selected);
    const all = ids.every((id) => next.has(id));
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
    onChange(next);
  };
  const fullTypes = carTypes.filter((ct) => ct.ids.every((id) => selected.has(id)));
  const typeLabel =
    fullTypes.length === 0
      ? "Car type..."
      : fullTypes.length === carTypes.length
        ? "All car types"
        : fullTypes.map((ct) => ct.name).join(", ");

  return (
    <div className="flex items-center gap-2">
      {/* Car type / category */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="h-9 w-[200px] justify-between px-3 text-sm font-normal">
            <span className="truncate">{typeLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search car type..." className="h-9" />
            <CommandList>
              <CommandEmpty>No car types.</CommandEmpty>
              <CommandGroup>
                {carTypes.map((ct) => {
                  const n = ct.ids.filter((id) => selected.has(id)).length;
                  const all = n === ct.ids.length;
                  return (
                    <CommandItem key={ct.id} value={ct.name} onSelect={() => toggleType(ct.ids)}>
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          all ? "bg-primary text-primary-foreground" : n > 0 ? "bg-primary/30" : "opacity-50"
                        )}
                      >
                        {all ? <Check className="h-3 w-3" /> : n > 0 ? <span className="h-0.5 w-2 rounded bg-primary" /> : null}
                      </div>
                      <span>{ct.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {n}/{ct.ids.length}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="h-9 w-[350px] justify-between px-3 text-sm font-normal"
          >
            <span className="truncate">
              {selected.size === 0
                ? "Select cars..."
                : selected.size === vehicles.length
                  ? `All cars (${vehicles.length})`
                  : `${selected.size} car${selected.size > 1 ? "s" : ""} selected`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search plate number..." className="h-9" />
            <CommandList>
              <CommandEmpty>No cars found.</CommandEmpty>
              <CommandGroup>
                {/* Select All */}
                <CommandItem onSelect={toggleAll} className="font-medium">
                  <div className={cn(
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                    allSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                  )}>
                    {allSelected && <Check className="h-3 w-3" />}
                  </div>
                  Select All
                  <span className="ml-auto text-xs text-muted-foreground">{vehicles.length}</span>
                </CommandItem>
                <div className="mx-1 my-1 h-px bg-border" />
                {/* Individual cars */}
                {vehicles.map((v) => {
                  const isSelected = selected.has(v.id);
                  return (
                    <CommandItem
                      key={v.id}
                      value={`${v.plateNumber} ${v.vehicleType?.name || ""}`}
                      onSelect={() => toggle(v.id)}
                    >
                      <div className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                      )}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <span>{v.plateNumber}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {v.vehicleType?.name}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected tags */}
      {selectedVehicles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedVehicles.map((v) => (
            <Badge
              key={v.id}
              variant="secondary"
              className="gap-1 pl-2 pr-1 text-xs cursor-pointer hover:bg-destructive/10"
              onClick={() => toggle(v.id)}
            >
              {v.plateNumber}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Main Page Component ─────────────────────── */

const CAR_DISPATCH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CAR_DISPATCH === "true";

export default function CarDispatchPage() {
  const router = useRouter();

  useEffect(() => {
    if (!CAR_DISPATCH_ENABLED) router.replace("/dashboard");
  }, [router]);

  if (!CAR_DISPATCH_ENABLED) return null;

  return <CarDispatchContent />;
}

function CarDispatchContent() {
  const t = useT();

  // Data
  const [ownedVehicles, setOwnedVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [zones, setZones] = useState<LocationOption[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  // RMF hotel list (System Parameters › Routes › RMF Hotels): Notes naming one set the row's route.
  const [rmfHotels, setRmfHotels] = useState<RmfHotel[]>([]);
  useEffect(() => {
    api.get("/rmf-hotels").then(
      (r) => setRmfHotels(r.data.data || []),
      () => setRmfHotels([])
    );
  }, []);

  // State
  const [cards, setCards] = useState<CarCard[]>([]);
  const [jobDate, setJobDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }));
  // Each owned car's main driver: shown in the card header and pre-filled on new rows.
  const [mainDrivers, setMainDrivers] = useState<Map<string, MainDriverLink>>(new Map());
  const [loading, setLoading] = useState(true);
  const { view, update: updateView } = useBoardView();
  const [selectedOwnedIds, setSelectedOwnedIds] = useState<Set<string>>(new Set());
  const [addCarOpen, setAddCarOpen] = useState(false);
  // Cancel a saved job from its card (same action as the B2B / Online pages: PATCH status CANCELLED).
  const canCancelJobs = usePermission("traffic-jobs.online.table.statusFilter");
  const [cancelTarget, setCancelTarget] = useState<{ vehicleId: string; uid: string; jobId: string; ref: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplierCarTypeId, setSelectedSupplierCarTypeId] = useState("");
  const [supplierCarTypes, setSupplierCarTypes] = useState<VehicleType[]>([]); // + supplierCarTypeId, quantity

  // ─── Fetch reference data ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehRes, custRes, drvRes, supRes, typRes, zoneRes] = await Promise.all([
        api.get("/vehicles", { params: { limit: 100 } }),
        api.get("/customers", { params: { limit: 1000 } }),
        api.get("/drivers", { params: { limit: 100, isActive: true } }),
        api.get("/dispatch/available-suppliers"),
        api.get("/vehicles/types"),
        api.get("/locations/zones"),
      ]);

      const allVehicles: Vehicle[] = (
        vehRes.data.data || vehRes.data
      ).filter((v: Vehicle) => v.isActive);
      const owned = allVehicles.filter((v) => !v.supplierId);
      setOwnedVehicles(owned);
      setCustomers(custRes.data.data || custRes.data);
      setDrivers(
        (drvRes.data.data || drvRes.data).filter((d: Driver) => d.isActive)
      );
      setSuppliers(supRes.data.data || supRes.data || []);
      setVehicleTypes(typRes.data.data || typRes.data || []);
      api
        .get("/dispatch/main-drivers")
        .then(({ data }) => {
          const list: MainDriverLink[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          setMainDrivers(new Map(list.map((m) => [m.vehicleId, m])));
        })
        .catch(() => setMainDrivers(new Map()));
      // Routes: a role without route access (e.g. Viewer) still gets the board.
      api.get("/job-service-types").then(
        (r) => setRoutes(r.data.data || r.data || []),
        () => setRoutes([])
      );
      const rawZones = zoneRes.data.data || zoneRes.data || [];
      setZones(rawZones.map((z: { id: string; name: string; city?: { name: string } }) => ({
        id: z.id,
        name: z.city ? `${z.name} (${z.city.name})` : z.name,
      })));

      // Build initial cards from owned vehicles
      setCards((prev) => {
        // Keep existing supplier cards and their jobs
        const supplierCards = prev.filter((c) => c.isSupplier);
        const ownedCards = owned.map((v) => {
          const existing = prev.find(
            (c) => c.vehicle.id === v.id && !c.isSupplier
          );
          return {
            vehicle: v,
            jobs: existing?.jobs || [],
            isSupplier: false,
          };
        });
        return [...ownedCards, ...supplierCards];
      });
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Supplier car types loading ───
  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierCarTypes([]);
      return;
    }
    api
      .get(`/suppliers/${selectedSupplierId}/car-types`)
      .then((res) => {
        setSupplierCarTypes(res.data.data || res.data || []);
      })
      .catch(() => setSupplierCarTypes([]));
  }, [selectedSupplierId]);

  // ─── Load existing jobs for the selected date ───
  const loadJobsForDate = useCallback(async () => {
    try {
      const res = await api.get("/dispatch/day", { params: { date: jobDate } });
      const dayData = res.data.data || res.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allJobs: any[] = [
        ...(dayData.arrivals || []),
        ...(dayData.departures || []),
        ...(dayData.cityJobs || dayData.city || []),
      ];

      // Group jobs by assigned vehicleId — supplier jobs by supplier car (type + car number)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobsByVehicle: Record<string, any[]> = {};
      const supplierVehicles: Record<string, Vehicle> = {};
      for (const j of allJobs) {
        const a = j.assignment;
        let vId: string | undefined = a?.vehicleId;
        if (!vId && a?.supplierCarTypeId && a.supplierCarType && a.supplierId) {
          const type: VehicleType = {
            ...a.supplierCarType.vehicleType,
            supplierCarTypeId: a.supplierCarTypeId,
            quantity: a.supplierCarType.quantity ?? 1,
          };
          const n = a.supplierCarNo ?? 1;
          const v = supplierCardVehicle(
            a.supplierId,
            a.supplier?.tradeName || a.supplier?.legalName || "Supplier",
            type,
            a.supplierCarTypeId,
            n,
            Math.max(type.quantity ?? 1, n),
          );
          supplierVehicles[v.id] = v;
          vId = v.id;
        }
        if (!vId) continue;
        if (!jobsByVehicle[vId]) jobsByVehicle[vId] = [];
        jobsByVehicle[vId].push(j);
      }

      // Map API jobs to JobRow format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toJobRow = (j: any): JobRow => ({
        uid: j.id,
        colors: (j.dispatchColors as JobColors | null) ?? undefined,
        customerId: j.customerId || "",
        customerJobId: j.customerJobId || "",
        bookingNumber: j.internalRef || "",
        description: "",
        pickUpTime: j.pickUpTime ? new Date(j.pickUpTime).toTimeString().slice(0, 5) : "",
        driverId: j.assignment?.driverId || "",
        extras: ((j.jobExtras || []) as JobExtra[]).map((e) => ({
          id: e.id,
          extraId: e.extraId ?? null,
          name: e.name,
          qty: Number(e.qty),
          unitAmount: Number(e.unitAmount),
          currency: e.currency,
          source: e.source,
        })),
        collectionAmount: j.collectionAmount ? String(j.collectionAmount) : "",
        collectionCurrency: j.collectionCurrency || "EGP",
        custRepName: j.custRepName || "",
        custRepMobile: j.custRepMobile || "",
        notes: j.notes || "",
        extraDriverName: j.assignment?.externalDriverName || "",
        extraDriverPhone: j.assignment?.externalDriverPhone || "",
        serviceType: j.serviceType || "ARR",
        jobServiceTypeId: j.jobServiceTypeId || "",
        status: j.status,
        originAirportId: j.originAirportId || "",
        originZoneId: j.originZoneId || "",
        originHotelId: j.originHotelId || "",
        destinationAirportId: j.destinationAirportId || "",
        destinationZoneId: j.destinationZoneId || "",
        destinationHotelId: j.destinationHotelId || "",
        paxCount: String(j.paxCount || 1),
        saved: true,
        saving: false,
        savedJobId: j.id,
        assignmentId: j.assignment?.id,
      });

      setCards((prev) => {
        const kept = prev.map((card) => {
          const existingJobs = jobsByVehicle[card.vehicle.id] || [];
          const existingRows = existingJobs.map(toJobRow);
          // Keep unsaved rows the user is currently editing
          const unsavedRows = card.jobs.filter((r) => !r.saved);
          return { ...card, jobs: [...existingRows, ...unsavedRows] };
        });
        // Supplier cars with saved jobs that aren't on the board yet
        const have = new Set(kept.map((c) => c.vehicle.id));
        const added = Object.values(supplierVehicles)
          .filter((v) => !have.has(v.id))
          .map((v) => ({ vehicle: v, jobs: (jobsByVehicle[v.id] || []).map(toJobRow), isSupplier: true }));
        return [...kept, ...added];
      });

      // Auto-select owned vehicles that have jobs on this date
      const vehicleIdsWithJobs = new Set(Object.keys(jobsByVehicle));
      if (vehicleIdsWithJobs.size > 0) {
        setSelectedOwnedIds((prev) => {
          const next = new Set(prev);
          for (const vId of vehicleIdsWithJobs) next.add(vId);
          return next;
        });
      }
    } catch {
      // Dispatch day endpoint may fail on dev environments with schema drift — silently skip
    }
  }, [jobDate]);

  useEffect(() => {
    if (!loading) {
      loadJobsForDate();
    }
  }, [jobDate, loading, loadJobsForDate]);

  // ─── Add supplier car ───
  const handleAddSupplierCar = () => {
    const carType = supplierCarTypes.find((ct) => ct.id === selectedSupplierCarTypeId);
    if (!carType) return;
    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    const qty = carType.quantity ?? 1;
    const used = new Set(
      cards
        .filter((c) => c.isSupplier && c.vehicle.supplierId === selectedSupplierId && c.vehicle.vehicleTypeId === carType.id)
        .map((c) => c.vehicle.supplierCarNo ?? 1),
    );
    const n = Array.from({ length: qty }, (_, i) => i + 1).find((k) => !used.has(k));
    if (!n) {
      toast.error(`All ${qty} agreed ${carType.name} car(s) from ${supplier?.tradeName || supplier?.legalName || "this supplier"} are already on the board`);
      return;
    }
    const virtualVehicle = supplierCardVehicle(
      selectedSupplierId,
      supplier?.tradeName || supplier?.legalName || "Supplier",
      carType,
      carType.supplierCarTypeId,
      n,
      qty,
    );
    setCards((prev) => [...prev, { vehicle: virtualVehicle, jobs: [], isSupplier: true }]);
    setAddCarOpen(false);
    setSelectedSupplierId("");
    setSelectedSupplierCarTypeId("");
  };

  // ─── Remove supplier card ───
  const removeSupplierCard = (vehicleId: string) => {
    setCards((prev) => prev.filter((c) => c.vehicle.id !== vehicleId));
  };

  // ─── Job row management ───
  const addJobRow = (vehicleId: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.vehicle.id === vehicleId
          ? { ...c, jobs: [...c.jobs, { ...newJobRow(), driverId: c.isSupplier ? "" : mainDrivers.get(vehicleId)?.driverId ?? "" }] }
          : c
      )
    );
  };

  // Row / cell colours: shown at once; saved on the job when it exists (else with its first save).
  const setJobColors = (vehicleId: string, uid: string, colors: JobColors) => {
    const job = cards.find((c) => c.vehicle.id === vehicleId)?.jobs.find((j) => j.uid === uid);
    setCards((prev) =>
      prev.map((c) => (c.vehicle.id === vehicleId ? { ...c, jobs: c.jobs.map((j) => (j.uid === uid ? { ...j, colors } : j)) } : c)),
    );
    if (job?.savedJobId) {
      api.patch(`/dispatch/jobs/${job.savedJobId}/colors`, { colors }).catch(() => toast.error("Could not save the colour"));
    }
  };

  /**
   * Notes → route (Routes › RMF Hotels list, lib/rmf-hotel-match): when the notes name an RMF
   * hotel, the row gets that hotel's area route for its leg (ARR / DEP / going / return —
   * from the current route, or from Type when Type was just changed). {} when nothing applies.
   */
  const notesRoute = (row: JobRow, byType: boolean): Partial<JobRow> & { _hotel?: string } => {
    const hotel = findRmfHotel(row.notes, rmfHotels);
    if (!hotel) return {};
    const current = routes.find((r) => r.id === row.jobServiceTypeId);
    const leg = legOf(byType ? undefined : current?.name, row.serviceType);
    const target = leg ? areaRoute(routes, leg, hotel.routeArea) : undefined;
    if (!target || target.id === row.jobServiceTypeId) return {};
    return { jobServiceTypeId: target.id, ...routeEnds(routes, target.id), ...(byType ? { serviceType: row.serviceType } : {}), _hotel: hotel.name };
  };

  const updateJobField = (
    vehicleId: string,
    uid: string,
    field: keyof JobRow,
    value: string | boolean | number
  ) => {
    // A route carries its default type and both ends (System Parameters › Routes).
    const routeFill = (): Partial<JobRow> => (field === "jobServiceTypeId" ? routeEnds(routes, String(value)) : {});
    const row = cards.find((c) => c.vehicle.id === vehicleId)?.jobs.find((j) => j.uid === uid);
    let auto: Partial<JobRow> = {};
    if (row && (field === "notes" || field === "serviceType")) {
      const { _hotel, ...fill } = notesRoute({ ...row, [field]: value } as JobRow, field === "serviceType");
      if (_hotel && fill.jobServiceTypeId) {
        auto = fill;
        const name = routes.find((r) => r.id === fill.jobServiceTypeId)?.name.split(" | ")[0];
        toast.info(`Route set to ${name} — ${_hotel} (RMF hotel list)`);
      }
    }
    setCards((prev) =>
      prev.map((c) =>
        c.vehicle.id === vehicleId
          ? {
              ...c,
              jobs: c.jobs.map((j) =>
                j.uid === uid ? { ...j, [field]: value, ...routeFill(), ...auto } : j
              ),
            }
          : c
      )
    );
  };

  // Datasheet ✱ row / Excel paste: new job rows from column values (see COLUMN_FIELD).
  const createJobRows = (vehicleId: string, values: Record<string, string>[]) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.vehicle.id !== vehicleId) return c;
        const created = values.map((v) => {
          let row = newJobRow();
          for (const [col, raw] of Object.entries(v)) {
            const field = COLUMN_FIELD[col as ColKey];
            if (!field) continue;
            const value = field === "pickUpTime" ? normTime(raw) : raw;
            row = { ...row, [field]: value, ...(field === "jobServiceTypeId" ? routeEnds(routes, value) : {}) };
          }
          if (!row.driverId && !c.isSupplier) row = { ...row, driverId: mainDrivers.get(vehicleId)?.driverId ?? "" };
          if (row.notes) {
            const { _hotel, ...fill } = notesRoute(row, false);
            if (_hotel) row = { ...row, ...fill };
          }
          return row;
        });
        return { ...c, jobs: [...c.jobs, ...created] };
      })
    );
  };

  const removeJobRow = (vehicleId: string, uid: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.vehicle.id === vehicleId
          ? { ...c, jobs: c.jobs.filter((j) => j.uid !== uid) }
          : c
      )
    );
  };

  // ─── Save job row → B2B pool ───
  const saveJobRow = async (vehicleId: string, uid: string) => {
    const card = cards.find((c) => c.vehicle.id === vehicleId);
    if (!card) return;
    const job = card.jobs.find((j) => j.uid === uid);
    if (!job || job.saved || job.saving) return;

    // Client-side validation
    const errors: string[] = [];
    // The board's day doubles as the new job's service date, so browsing a past
    // day must not become a way to back-date a job. Viewing stays open; only
    // creating is blocked.
    if (isPastServiceDate(jobDate))
      errors.push("Can't create a job on a past date — switch the board to today or later");
    if (!job.customerId) errors.push("Customer is required");
    if (!job.jobServiceTypeId) errors.push("Route is required");
    else if (
      (!job.originZoneId && !job.originAirportId && !job.originHotelId) ||
      (!job.destinationZoneId && !job.destinationAirportId && !job.destinationHotelId)
    )
      errors.push("This route has no From / To — set them in System Parameters › Routes");
    if (errors.length > 0) {
      setCards((prev) =>
        prev.map((c) =>
          c.vehicle.id === vehicleId
            ? {
                ...c,
                jobs: c.jobs.map((j) =>
                  j.uid === uid ? { ...j, error: errors.join(", ") } : j
                ),
              }
            : c
        )
      );
      return;
    }

    // Mark saving
    setCards((prev) =>
      prev.map((c) =>
        c.vehicle.id === vehicleId
          ? {
              ...c,
              jobs: c.jobs.map((j) =>
                j.uid === uid ? { ...j, saving: true } : j
              ),
            }
          : c
      )
    );

    try {
      // Build payload for traffic-jobs API
      const payload: Record<string, unknown> = {
        bookingChannel: "B2B",
        serviceType: job.serviceType || "ARR",
        jobServiceTypeId: job.jobServiceTypeId || undefined,
        jobDate: jobDate,
        adultCount: parseInt(job.paxCount) || 1,
        childCount: 0,
        customerId: job.customerId || undefined,
        customerJobId: job.customerJobId?.trim() || undefined,
        custRepName: job.custRepName || undefined,
        custRepMobile: job.custRepMobile || undefined,
        notes: job.notes?.trim() || undefined,
        extras: job.extras
          .filter((e) => e.name && e.qty > 0)
          .map((e) => ({
            extraId: e.extraId ?? undefined,
            name: e.name,
            qty: e.qty,
            unitAmount: e.unitAmount,
            currency: e.currency,
            source: e.source,
          })),
        pickUpTime: job.pickUpTime
          ? `${jobDate}T${job.pickUpTime}:00`
          : undefined,
        collectionRequired: !!job.collectionAmount,
        collectionAmount: job.collectionAmount
          ? parseFloat(job.collectionAmount)
          : undefined,
        collectionCurrency: job.collectionCurrency || "EGP",
      };

      // Origin / destination from description or IDs
      if (job.originAirportId) payload.originAirportId = job.originAirportId;
      if (job.originZoneId) payload.originZoneId = job.originZoneId;
      if (job.originHotelId) payload.originHotelId = job.originHotelId;
      if (job.destinationAirportId)
        payload.destinationAirportId = job.destinationAirportId;
      if (job.destinationZoneId)
        payload.destinationZoneId = job.destinationZoneId;
      if (job.destinationHotelId)
        payload.destinationHotelId = job.destinationHotelId;

      // For supplier cards: set requested vehicle type, no real vehicle assignment
      if (card.isSupplier) {
        payload.requestedVehicleTypeId = card.vehicle.vehicleTypeId;
      }

      // Remove undefined
      Object.keys(payload).forEach(
        (k) => payload[k] === undefined && delete payload[k]
      );

      const res = await api.post("/traffic-jobs", payload);
      const created = res.data.data || res.data;

      // Only assign real vehicle + driver for owned cars (not supplier cards)
      if (created.id && !card.isSupplier) {
        const assignPayload: Record<string, unknown> = {
          trafficJobId: created.id,
          vehicleId: vehicleId,
        };
        if (job.driverId) {
          assignPayload.driverId = job.driverId;
        }
        if (job.extraDriverName) {
          assignPayload.externalDriverName = job.extraDriverName;
          if (job.extraDriverPhone) {
            assignPayload.externalDriverPhone = job.extraDriverPhone;
          }
        }
        await api.post("/dispatch/assign", assignPayload);
      } else if (created.id && card.isSupplier && card.vehicle.supplierCarTypeId) {
        try {
          await api.post("/dispatch/assign", {
            trafficJobId: created.id,
            supplierCarTypeId: card.vehicle.supplierCarTypeId,
            supplierId: card.vehicle.supplierId,
            supplierCarNo: card.vehicle.supplierCarNo ?? 1,
            ...(job.extraDriverName ? { externalDriverName: job.extraDriverName } : {}),
            ...(job.extraDriverPhone ? { externalDriverPhone: job.extraDriverPhone } : {}),
          });
        } catch (e: unknown) {
          const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
          toast.warning(`Job ${created.internalRef || ""} saved but not assigned to the supplier car${m ? `: ${m}` : ""} — assign it on Dispatch`);
        }
      }
      if (hasColors(job.colors)) {
        api.patch(`/dispatch/jobs/${created.id}/colors`, { colors: job.colors }).catch(() => toast.error("Row colours were not saved"));
      }

      // Update row as saved
      setCards((prev) =>
        prev.map((c) =>
          c.vehicle.id === vehicleId
            ? {
                ...c,
                jobs: c.jobs.map((j) =>
                  j.uid === uid
                    ? {
                        ...j,
                        saved: true,
                        saving: false,
                        savedJobId: created.id,
                        bookingNumber: created.internalRef || "",
                        error: undefined,
                      }
                    : j
                ),
              }
            : c
        )
      );
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axErr = err as any;
      const apiMsg = axErr?.response?.data?.message;
      const msg = Array.isArray(apiMsg) ? apiMsg.join(", ") : apiMsg || (err instanceof Error ? err.message : "Failed to save job");
      setCards((prev) =>
        prev.map((c) =>
          c.vehicle.id === vehicleId
            ? {
                ...c,
                jobs: c.jobs.map((j) =>
                  j.uid === uid
                    ? { ...j, saving: false, error: msg }
                    : j
                ),
              }
            : c
        )
      );
    }
  };

  // ─── Cancel a saved job (after confirmation) ───
  const confirmCancelJob = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.patch(`/traffic-jobs/${cancelTarget.jobId}/status`, { status: "CANCELLED" });
      setCards((prev) =>
        prev.map((c) =>
          c.vehicle.id === cancelTarget.vehicleId
            ? { ...c, jobs: c.jobs.map((j) => (j.uid === cancelTarget.uid ? { ...j, status: "CANCELLED", error: undefined } : j)) }
            : c
        )
      );
      toast.success(`Job ${cancelTarget.ref} cancelled`);
      setCancelTarget(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Could not cancel the job");
    } finally {
      setCancelling(false);
    }
  };

  // ─── Change a saved job's driver / extra driver / car (PATCH /dispatch/assignments/:id) ───
  // reassignJob keeps the 48 h dispatcher lock, availability and conflict checks, notifies the new /
  // removed driver and syncs pricing. A refusal rolls the cell back.
  const reassignSaved = async (
    vehicleId: string,
    job: JobRow,
    patch: { driverId?: string; externalDriverName?: string; externalDriverPhone?: string; vehicleId?: string },
    rollback?: () => void,
  ) => {
    if (!job.assignmentId) return;
    try {
      await api.patch(`/dispatch/assignments/${job.assignmentId}`, patch);
      toast.success(patch.vehicleId ? `${job.bookingNumber} moved` : `${job.bookingNumber} updated`);
      if (patch.vehicleId) {
        setSelectedOwnedIds((prev) => new Set(prev).add(patch.vehicleId!));
        await loadJobsForDate();
      }
    } catch (err: unknown) {
      rollback?.();
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "Could not change the assignment");
    }
    void vehicleId;
  };

  // ─── Save all unsaved jobs on a card ───
  const saveAllJobs = async (vehicleId: string) => {
    const card = cards.find((c) => c.vehicle.id === vehicleId);
    if (!card) return;
    for (const job of card.jobs) {
      if (!job.saved && !job.saving) {
        await saveJobRow(vehicleId, job.uid);
      }
    }
  };

  // ─── Combobox option lists ───
  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: c.tradeName || c.legalName,
  }));

  const driverOptions = drivers.map((d) => ({
    value: d.id,
    label: `${d.name} (${d.mobileNumber})`,
  }));

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: s.tradeName || s.legalName,
  }));


  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Traffic Cover</h1>
          <p className="text-sm text-muted-foreground">
            Assign jobs to vehicles — jobs are posted to B2B pool on save
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Date:</Label>
            <Input
              type="date"
              value={jobDate}
              onChange={(e) => setJobDate(e.target.value)}
              min="2020-01-01"
              className="h-9 w-[160px]"
            />
            {isPastServiceDate(jobDate) && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Past day — view only, new jobs can&apos;t be added
              </span>
            )}
          </div>
          <Button onClick={() => setAddCarOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Supplier Car
          </Button>
        </div>
      </div>

      {/* ─── Customer report: customer + the date above → PDF / Excel ─── */}
      <CustomerReportBar customerOptions={customerOptions} jobDate={jobDate} />

      <Separator />

      {/* ─── Owned Car Multi-Select ─── */}
      {ownedVehicles.length > 0 && (
        <MultiSelectCars
          vehicles={ownedVehicles}
          selected={selectedOwnedIds}
          onChange={setSelectedOwnedIds}
        />
      )}

      {/* ─── Board toolbar: legend + cards per row ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ColorLegend />
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Cards per row</Label>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {([2, 3] as const).map((n) => (
              <Button
                key={n}
                size="sm"
                variant={view.perRow === n ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => updateView({ perRow: n })}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Car Cards Grid ─── */}
      <div className={cn("grid grid-cols-1 gap-4", view.perRow === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {cards.filter((c) => c.isSupplier || selectedOwnedIds.has(c.vehicle.id)).map((card) => (
          <VehicleCard
            key={card.vehicle.id}
            card={card}
            view={view}
            onViewChange={updateView}
            customerOptions={customerOptions}
            driverOptions={driverOptions}
            mainDriver={card.isSupplier ? undefined : mainDrivers.get(card.vehicle.id)}
            routeOptions={routes}
            onAddJob={() => addJobRow(card.vehicle.id)}
            onCreateRows={(values) => createJobRows(card.vehicle.id, values)}
            onUpdateField={(uid, field, value) =>
              updateJobField(card.vehicle.id, uid, field, value)
            }
            onSetColors={(uid, colors) => setJobColors(card.vehicle.id, uid, colors)}
            onRemoveJob={(uid) => removeJobRow(card.vehicle.id, uid)}
            onReassign={(job, field, value) => {
              const before = job[field] as string;
              updateJobField(card.vehicle.id, job.uid, field, value);
              const rollback = () => updateJobField(card.vehicle.id, job.uid, field, before);
              const patch =
                field === "driverId"
                  ? { driverId: value }
                  : {
                      externalDriverName: field === "extraDriverName" ? value : job.extraDriverName,
                      externalDriverPhone: field === "extraDriverPhone" ? value : job.extraDriverPhone,
                    };
              reassignSaved(card.vehicle.id, job, patch, rollback);
            }}
            moveTargets={cards
              .filter((c) => !c.isSupplier && c.vehicle.id !== card.vehicle.id)
              .map((c) => ({ id: c.vehicle.id, label: `${c.vehicle.plateNumber}${c.vehicle.vehicleType?.name ? ` · ${c.vehicle.vehicleType.name}` : ""}` }))}
            onMoveJob={(job, toVehicleId) => reassignSaved(card.vehicle.id, job, { vehicleId: toVehicleId })}
            onSaveJob={(uid) => saveJobRow(card.vehicle.id, uid)}
            onSaveAll={() => saveAllJobs(card.vehicle.id)}
            onCancelJob={
              canCancelJobs
                ? (job) =>
                    job.savedJobId &&
                    setCancelTarget({ vehicleId: card.vehicle.id, uid: job.uid, jobId: job.savedJobId, ref: job.bookingNumber || job.customerJobId || "" })
                : undefined
            }
            onRemoveCard={
              card.isSupplier
                ? () => removeSupplierCard(card.vehicle.id)
                : undefined
            }
          />
        ))}

        {cards.length === 0 && (
          <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
            No vehicles found. Add a supplier car to get started.
          </div>
        )}
      </div>

      {/* ─── Cancel Job Confirmation ─── */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && !cancelling && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel job {cancelTarget?.ref}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The job is marked CANCELLED and its driver and rep are notified. This can&apos;t be undone from here.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep job
            </Button>
            <Button variant="destructive" onClick={confirmCancelJob} disabled={cancelling} className="gap-1.5">
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Supplier Car Dialog ─── */}
      <Dialog open={addCarOpen} onOpenChange={setAddCarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Supplier Car</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <ComboSelect
                options={supplierOptions}
                value={selectedSupplierId}
                onChange={(v) => {
                  setSelectedSupplierId(v);
                  setSelectedSupplierCarTypeId("");
                }}
                placeholder="Select supplier..."
              />
            </div>
            {selectedSupplierId && (
              <div className="space-y-2">
                <Label>Car Type</Label>
                {supplierCarTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No car types defined for this supplier. Add car types in the supplier settings.
                  </p>
                ) : (
                  <ComboSelect
                    options={supplierCarTypes.map((ct) => {
                      const onBoard = cards.filter(
                        (c) => c.isSupplier && c.vehicle.supplierId === selectedSupplierId && c.vehicle.vehicleTypeId === ct.id,
                      ).length;
                      return {
                        value: ct.id,
                        label: `${ct.name} (${ct.seatCapacity} seats) · ${onBoard}/${ct.quantity ?? 1} on the board`,
                      };
                    })}
                    value={selectedSupplierCarTypeId}
                    onChange={setSelectedSupplierCarTypeId}
                    placeholder="Select car type..."
                  />
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCarOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSupplierCar}
              disabled={!selectedSupplierCarTypeId}
            >
              Add Vehicle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────── Board view settings ───────────────────── */
// One per user (user-preferences key "car_dispatch_view"), shared by every card on the board:
// cards per row, hidden columns and column widths.

type ColKey =
  | "customer" | "booking" | "custJobId" | "route" | "time" | "driver"
  | "custRepName" | "custRepMobile" | "extraDriverName" | "extraDriverPhone" | "type" | "pax" | "notes" | "actions";

/** Datasheet column → JobRow field. */
const COLUMN_FIELD: Partial<Record<ColKey, keyof JobRow>> = {
  customer: "customerId",
  custJobId: "customerJobId",
  route: "jobServiceTypeId",
  time: "pickUpTime",
  driver: "driverId",
  custRepName: "custRepName",
  custRepMobile: "custRepMobile",
  extraDriverName: "extraDriverName",
  extraDriverPhone: "extraDriverPhone",
  type: "serviceType",
  pax: "paxCount",
  notes: "notes",
};

/** "930" / "0930" / "9:30" → "09:30". */
/**
 * "Move to car…" on a saved row: searchable, height-capped list of the board's cars. (The plain list
 * ran off the top of short windows once the fleet grew, leaving the first cars unreachable.)
 */
function MoveToCarMenu({
  bookingNumber,
  targets,
  onMove,
}: {
  bookingNumber: string;
  targets: { id: string; label: string }[];
  onMove: (carId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? targets.filter((t) => t.label.toLowerCase().includes(needle)) : targets;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" title="Move to car…" className="text-primary hover:opacity-70">
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="flex w-60 flex-col p-1"
        style={{ maxHeight: "min(22rem, var(--radix-popover-content-available-height))" }}
      >
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">Move {bookingNumber} to car</div>
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search plate or type…"
          className="mb-1 h-7 text-xs"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((t) => (
            <button
              key={t.id}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                setOpen(false);
                setQ("");
                onMove(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
          {shown.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No car matches</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function normTime(v: string): string {
  const t = v.trim();
  const m = t.match(/^(\d{1,2})[:.]?(\d{2})$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

/** A route's default type and both ends, copied onto the job row when it is picked. */
function routeEnds(routes: RouteOption[], id: string): Partial<JobRow> {
  const r = routes.find((x) => x.id === id);
  if (!r) return {};
  return {
    ...(r.defaultServiceType && { serviceType: r.defaultServiceType }),
    originAirportId: r.fromAirport?.id ?? "",
    originZoneId: r.fromAirport ? "" : r.fromZone?.id ?? "",
    originHotelId: "",
    destinationAirportId: r.toAirport?.id ?? "",
    destinationZoneId: r.toAirport ? "" : r.toZone?.id ?? "",
    destinationHotelId: "",
  };
}

const JOB_COLUMNS: { key: ColKey; label: string; width: number; center?: boolean; fixed?: boolean }[] = [
  { key: "customer", label: "Customer", width: 140 },
  { key: "booking", label: "Booking #", width: 80 },
  { key: "custJobId", label: "Cust. Job ID", width: 90 },
  { key: "route", label: "Route", width: 200 },
  { key: "time", label: "Time", width: 56 },
  { key: "driver", label: "Driver", width: 130 },
  { key: "custRepName", label: "Cust. Rep", width: 100 },
  { key: "custRepMobile", label: "Rep Mobile", width: 96 },
  { key: "extraDriverName", label: "Extra Driver", width: 100 },
  { key: "extraDriverPhone", label: "Driver Phone", width: 96 },
  { key: "type", label: "Type", width: 90 },
  { key: "pax", label: "Pax", width: 44, center: true },
  { key: "notes", label: "Notes", width: 180 },
  { key: "actions", label: "Act", width: 64, center: true, fixed: true },
];

const VIEW_PREF_KEY = "car_dispatch_view";

interface BoardView {
  perRow: 2 | 3;
  hidden: ColKey[];
  widths: Partial<Record<ColKey, number>>;
}

const DEFAULT_VIEW: BoardView = { perRow: 2, hidden: [], widths: {} };

function useBoardView() {
  const [view, setView] = useState<BoardView>(DEFAULT_VIEW);

  useEffect(() => {
    api
      .get(`/user-preferences/${VIEW_PREF_KEY}`)
      .then((res) => {
        const v = res.data?.value;
        if (v && typeof v === "object") {
          setView({
            perRow: v.perRow === 3 ? 3 : 2,
            hidden: Array.isArray(v.hidden) ? v.hidden.filter((k: string) => JOB_COLUMNS.some((c) => c.key === k && !c.fixed)) : [],
            widths: v.widths && typeof v.widths === "object" ? v.widths : {},
          });
        }
      })
      .catch(() => {});
  }, []);

  /** Update and persist. `persist: false` while a column is being dragged; saved on release. */
  const update = useCallback((patch: Partial<BoardView>, persist = true) => {
    setView((prev) => {
      const next = { ...prev, ...patch };
      if (persist) api.put(`/user-preferences/${VIEW_PREF_KEY}`, { value: next }).catch(() => {});
      return next;
    });
  }, []);

  return { view, update };
}

/* ───────────────────── Job colour (Cust. Job ID cell) ───────────────────── */
// Conditional formatting on the Cust. Job ID cell only, driven by the Type picked on the row:
// Departure = green, Arrival = blue, Cancelled = red (wins over the type); white text on colour.

function jobColor(job: JobRow): string | null {
  if (job.status === "CANCELLED") return "bg-red-600";
  if (job.serviceType === "DEP") return "bg-green-600";
  if (job.serviceType === "ARR") return "bg-blue-600";
  return null;
}

const COLOR_LEGEND = [
  { label: "Departure", className: "bg-green-600" },
  { label: "Arrival", className: "bg-blue-600" },
  { label: "Cancelled", className: "bg-red-600" },
];

function ColorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {COLOR_LEGEND.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm", l.className)} />
          {l.label}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────── Customer report ───────────────────── */

interface CustomerReport {
  customerName: string;
  date: string;
  rows: {
    customerJobId: string;
    route: string;
    time: string;
    driverName: string;
    driverNumber: string;
    carNumber: string;
    extraDriver: string;
    notes: string;
  }[];
}

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * One customer's jobs on the board's date (cancelled left out, by time): the customer's name once,
 * then Customer Job ID / Route / Time / Driver Name / Driver Number / Car Number / Extra Driver / Notes.
 * The report is loaded when the customer (or date) is picked, so PDF opens the print view straight
 * from the click (a window opened after a wait is blocked as a pop-up).
 */
function CustomerReportBar({ customerOptions, jobDate }: { customerOptions: { value: string; label: string }[]; jobDate: string }) {
  const { user } = useAuthStore();
  const { logoUrl, companyName } = useCompanyStore();
  const [customerId, setCustomerId] = useState("");
  const [report, setReport] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setReport(null);
      return;
    }
    let live = true;
    setLoading(true);
    api
      .get("/dispatch/customer-report", { params: { date: jobDate, customerId } })
      .then(({ data }) => live && setReport((data?.data ?? data) as CustomerReport))
      .catch(() => {
        if (!live) return;
        setReport(null);
        toast.error("Could not load the customer's jobs");
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [customerId, jobDate]);

  const exportPdf = () => {
    if (!report) return;
    const head = ["Customer Job ID", "Route", "Time", "Driver Name", "Driver Number", "Car Number", "Extra Driver", "Notes"];
    const body = report.rows.length
      ? report.rows
          .map(
            (r) =>
              `<tr>${[r.customerJobId, r.route, r.time, r.driverName, r.driverNumber, r.carNumber, r.extraDriver, r.notes]
                .map((v) => `<td>${esc(v || "")}</td>`)
                .join("")}</tr>`,
          )
          .join("")
      : `<tr><td colspan="8">No jobs for this customer on this date.</td></tr>`;
    const html = `<h1>${esc(report.customerName)}</h1><h2>${esc(report.date)} · ${report.rows.length} job(s)</h2>
      <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    if (!printReport({ title: `${report.customerName} — ${report.date}`, html, userName: user?.name, logoUrl, companyName })) {
      toast.error("Allow pop-ups for this site to open the PDF");
    }
  };

  const exportExcel = async () => {
    if (!customerId) return;
    setExcelBusy(true);
    try {
      const res = await api.get("/dispatch/customer-report/xlsx", { params: { date: jobDate, customerId }, responseType: "blob" });
      const name = (report?.customerName || "customer").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
      downloadBlob(res.data as Blob, `${name}-${jobDate}.xlsx`);
    } catch {
      toast.error("Could not export the Excel file");
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label className="text-sm font-medium">Customer report:</Label>
      <ComboSelect options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Search customer…" className="h-9 w-[260px]" />
      <Button size="sm" variant="outline" className="gap-1.5" disabled={!report || loading} onClick={exportPdf}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        PDF
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" disabled={!customerId || excelBusy} onClick={exportExcel}>
        {excelBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
        Excel
      </Button>
      {report && !loading && (
        <span className="text-xs text-muted-foreground">
          {report.rows.length} job(s) on {jobDate}
        </span>
      )}
    </div>
  );
}

/* ───────────────────── Column picker ───────────────────── */

function ColumnPicker({ view, onChange }: { view: BoardView; onChange: (patch: Partial<BoardView>) => void }) {
  const hidden = new Set(view.hidden);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Columns">
          <Columns3 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Columns (all cards)</p>
        {JOB_COLUMNS.filter((c) => !c.fixed).map((c) => (
          <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
            <Checkbox
              checked={!hidden.has(c.key)}
              onCheckedChange={(on) =>
                onChange({ hidden: on ? view.hidden.filter((k) => k !== c.key) : [...view.hidden, c.key] })
              }
            />
            {c.label}
          </label>
        ))}
        {(view.hidden.length > 0 || Object.keys(view.widths).length > 0) && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 w-full text-xs"
            onClick={() => onChange({ hidden: [], widths: {} })}
          >
            Reset columns
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────── Vehicle Card Component ───────────────────── */

function VehicleCard({
  card,
  view,
  onViewChange,
  customerOptions,
  driverOptions,
  mainDriver,
  routeOptions,
  onAddJob,
  onSetColors,
  onCreateRows,
  onUpdateField,
  onRemoveJob,
  onSaveJob,
  onSaveAll,
  onCancelJob,
  onRemoveCard,
  onReassign,
  moveTargets = [],
  onMoveJob,
}: {
  card: CarCard;
  view: BoardView;
  onViewChange: (patch: Partial<BoardView>, persist?: boolean) => void;
  customerOptions: { value: string; label: string }[];
  driverOptions: { value: string; label: string }[];
  mainDriver?: MainDriverLink;
  routeOptions: RouteOption[];
  onAddJob: () => void;
  onSetColors: (uid: string, colors: JobColors) => void;
  onCreateRows: (values: Record<string, string>[]) => void;
  onUpdateField: (uid: string, field: keyof JobRow, value: string | boolean | number) => void;
  onRemoveJob: (uid: string) => void;
  onSaveJob: (uid: string) => void;
  onSaveAll: () => void;
  /** Present only for users allowed to cancel jobs. */
  onCancelJob?: (job: JobRow) => void;
  onRemoveCard?: () => void;
  /** Saved job: change driver / extra driver (rolls back on refusal). */
  onReassign?: (job: JobRow, field: "driverId" | "extraDriverName" | "extraDriverPhone", value: string) => void;
  /** Other owned cars on the board a saved job can move to. */
  moveTargets?: { id: string; label: string }[];
  onMoveJob?: (job: JobRow, toVehicleId: string) => void;
}) {
  const { vehicle, jobs, isSupplier } = card;
  // Fixed per car (vehicle page › Card colour, or automatic) so cars are told apart at a glance.
  const cardColor = cardColorOf(vehicle);
  // Last selected cell in this card's grid (kept while the colour picker is open).
  const [picked, setPicked] = useState<{ uid: string; col: string } | null>(null);
  const [pickColor, setPickColor] = useState(HIGHLIGHTS[0]);
  const pickedJob = picked ? jobs.find((j) => j.uid === picked.uid) : undefined;
  const applyColor = (scope: "cell" | "row", color: string | null) => {
    if (!pickedJob || !picked) return;
    const cur = pickedJob.colors ?? {};
    const cells = { ...(cur.cells ?? {}) };
    let row = cur.row;
    if (scope === "row") {
      row = color ?? undefined;
      if (color === null) Object.keys(cells).forEach((k) => delete cells[k]);
    } else if (color) cells[picked.col] = color;
    else delete cells[picked.col];
    onSetColors(pickedJob.uid, { ...(row ? { row } : {}), ...(Object.keys(cells).length ? { cells } : {}) });
  };
  const tint = (hex: string) => ({ backgroundColor: `${hex}66` });
  const asNamePhone = (label: string) => label.replace(/ \(([^)]*)\)$/, " · $1");
  const otherDrivers = isSupplier
    ? []
    : [...new Set(jobs.map((j) => j.driverId).filter((id) => id && id !== mainDriver?.driverId))]
        .map((id) => driverOptions.find((o) => o.value === id)?.label)
        .filter((l): l is string => !!l)
        .map(asNamePhone);
  const unsavedCount = jobs.filter((j) => !j.saved).length;
  const columns = JOB_COLUMNS.filter((c) => c.fixed || !view.hidden.includes(c.key));
  const widthOf = (c: (typeof JOB_COLUMNS)[number]) => view.widths[c.key] ?? c.width;

  const typeOptions = SERVICE_TYPE_DROPDOWN_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  const routeList = routeOptions.map((r) => ({ value: r.id, label: r.name }));
  const open = (j: JobRow) => !j.saved; // saved jobs are read-only on the board…
  // …except who drives them: driver, extra driver and the car (Act › move) while the job is live.
  const live = (j: JobRow) =>
    j.saved && !!j.assignmentId && !isSupplier && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(j.status ?? "");
  const assignable = (j: JobRow) => open(j) || live(j);

  const dsColumns: DSColumn<JobRow>[] = columns.map((c): DSColumn<JobRow> => {
    const base = { key: c.key, title: c.label, width: widthOf(c), align: c.center ? ("center" as const) : undefined };
    switch (c.key) {
      case "customer":
        return { ...base, type: "select", options: customerOptions, get: (j) => j.customerId, editable: open };
      case "booking":
        return { ...base, type: "readonly", get: (j) => j.bookingNumber, display: (j) => j.bookingNumber || <span className="italic">Auto</span> };
      case "custJobId":
        return {
          ...base,
          get: (j) => j.customerJobId,
          editable: open,
          // Conditional formatting: the job colour (Departure / Arrival / Cancelled), white text.
          cellClassName: (j) => {
            const color = jobColor(j);
            return color ? `${color} text-white` : undefined;
          },
        };
      case "route":
        return { ...base, type: "select", options: routeList, get: (j) => j.jobServiceTypeId, editable: open };
      case "time":
        return { ...base, get: (j) => j.pickUpTime, editable: open, placeholder: "HH:MM" };
      case "driver":
        return isSupplier
          ? { ...base, type: "readonly", get: () => "", display: () => <span className="italic">External</span> }
          : {
              ...base,
              type: "select",
              options: driverOptions,
              get: (j) => j.driverId,
              editable: assignable,
              display: (j) => {
                const label = driverOptions.find((o) => o.value === j.driverId)?.label ?? "";
                if (!mainDriver || !j.driverId || j.driverId === mainDriver.driverId) return label;
                return (
                  <span title={`Main driver: ${mainDriver.driverName}`}>
                    {label} <span className="text-amber-600">(main: {mainDriver.driverName})</span>
                  </span>
                );
              },
            };
      case "type":
        return { ...base, type: "select", options: typeOptions, get: (j) => j.serviceType, editable: open };
      case "notes":
        return {
          ...base,
          get: (j) => j.notes,
          editable: open,
          placeholder: "Hotel / notes",
          display: (j) => <span title={j.notes}>{j.notes}</span>,
        };
      case "pax":
        return { ...base, type: "number", get: (j) => j.paxCount, editable: open };
      case "actions":
        return {
          ...base,
          type: "readonly",
          get: () => "",
          display: (j) => (
            <span className="flex items-center justify-center gap-1">
              {j.saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : j.saved ? (
                <span className={cn("text-[10px] font-medium", j.status === "CANCELLED" ? "text-red-600" : "text-green-600")}>
                  {j.status === "CANCELLED" ? "CXL" : "OK"}
                </span>
              ) : (
                <button type="button" title="Remove row" onClick={() => onRemoveJob(j.uid)} className="text-destructive hover:opacity-70">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {live(j) && onMoveJob && moveTargets.length > 0 && (
                <MoveToCarMenu bookingNumber={j.bookingNumber} targets={moveTargets} onMove={(carId) => onMoveJob(j, carId)} />
              )}
              {j.saved && j.savedJobId && onCancelJob && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(j.status ?? "") && (
                <button type="button" title="Cancel job" onClick={() => onCancelJob(j)} className="text-destructive hover:opacity-70">
                  <Ban className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ),
        };
      default: {
        const field = COLUMN_FIELD[c.key]!;
        const reassignable = field === "extraDriverName" || field === "extraDriverPhone";
        return { ...base, get: (j) => String(j[field] ?? ""), editable: reassignable ? assignable : open };
      }
    }
  });

  return (
    <Card
      className={cn(
        "min-w-0 gap-0 overflow-hidden py-0 text-[11px] [&_*]:text-[11px]",
        isSupplier && "border-amber-300 dark:border-amber-700"
      )}
    >
      {/* ─── Card Header: Plate + Type ─── */}
      <CardHeader
        className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-3 py-2 [.border-b]:pb-2"
        style={{ backgroundColor: `${cardColor}2e`, borderLeft: `6px solid ${cardColor}` }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: cardColor }}>
            <Car className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold tracking-wider">
                {vehicle.plateNumber}
              </span>
              <Badge variant="secondary" className="text-xs">
                {vehicle.vehicleType?.name || "Unknown"}
              </Badge>
              {isSupplier && (
                <Badge
                  variant="outline"
                  className="border-amber-400 text-amber-600 text-xs"
                >
                  Supplier
                </Badge>
              )}
              {isSupplier && (
                <span className="text-[10px] text-muted-foreground">Saved supplier jobs are re-assigned on the Dispatch page</span>
              )}
            </div>
            {(vehicle.carBrand || vehicle.carModel) && (
              <p className="text-xs text-muted-foreground">
                {[vehicle.carBrand, vehicle.carModel]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            )}
            {!isSupplier && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1" title="Main driver (driver page / vehicle page)">
                  <UserRound className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">Main:</span>
                  {mainDriver ? (
                    <span className="font-medium">
                      {mainDriver.driverName}
                      {mainDriver.driverMobile ? <span className="font-normal text-muted-foreground"> · {mainDriver.driverMobile}</span> : null}
                    </span>
                  ) : (
                    <span className="italic text-muted-foreground">none</span>
                  )}
                </span>
                {otherDrivers.length > 0 && (
                  <span className="inline-flex flex-wrap items-center gap-1" title="Other drivers on this car's jobs">
                    <ArrowRightLeft className="h-3 w-3 text-amber-600" />
                    <span className="text-muted-foreground">Also:</span>
                    <span className="font-medium">{otherDrivers.join(", ")}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {unsavedCount > 0 && (
            <Button
              size="sm"
              onClick={onSaveAll}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save All ({unsavedCount})
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Colour the selected cell or row">
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-2">
              <p className="pb-1 text-xs font-medium text-muted-foreground">
                {pickedJob
                  ? `Row ${pickedJob.bookingNumber || pickedJob.customerJobId || "(new)"} · ${picked?.col}`
                  : "Select a cell in this card first"}
              </p>
              <div className="flex flex-wrap gap-1.5 pb-2">
                {HIGHLIGHTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setPickColor(c)}
                    className={cn("h-6 w-6 rounded border-2", pickColor === c ? "border-foreground" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  title="Custom colour"
                  value={pickColor}
                  onChange={(e) => setPickColor(e.target.value)}
                  className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" className="h-7 text-xs" disabled={!pickedJob} onClick={() => applyColor("cell", pickColor)}>
                  Colour cell
                </Button>
                <Button size="sm" className="h-7 text-xs" disabled={!pickedJob} onClick={() => applyColor("row", pickColor)}>
                  Colour row
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!pickedJob?.colors?.cells?.[picked?.col ?? ""]} onClick={() => applyColor("cell", null)}>
                  Clear cell
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!hasColors(pickedJob?.colors)} onClick={() => applyColor("row", null)}>
                  Clear row
                </Button>
              </div>
              <p className="pt-2 text-[10px] text-muted-foreground">Saved on the job — everyone sees it until someone changes it.</p>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={onAddJob} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Job
          </Button>
          <ColumnPicker view={view} onChange={(p) => onViewChange(p)} />
          {onRemoveCard && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemoveCard}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      {/* ─── Jobs datasheet (Access-style: ✱ row adds a job, a row saves when you leave it) ─── */}
      <CardContent className="p-0">
        <DataSheet
          rows={jobs}
          rowKey={(j) => j.uid}
          columns={dsColumns}
          dense
          maxHeight="none"
          className="rounded-none border-0"
          onChange={(j, col, value) => {
            const field = COLUMN_FIELD[col as ColKey];
            if (!field) return;
            if (j.saved) {
              // Only the driver cells are editable on a saved row; each change is saved at once.
              if ((field === "driverId" || field === "extraDriverName" || field === "extraDriverPhone") && value !== j[field]) {
                onReassign?.(j, field, value);
              }
              return;
            }
            onUpdateField(j.uid, field, field === "pickUpTime" ? normTime(value) : value);
          }}
          onCreateRows={onCreateRows}
          onRowLeave={(j) => {
            if (!j.saved && !j.saving && (j.customerId || j.jobServiceTypeId || j.customerJobId)) onSaveJob(j.uid);
          }}
          onDeleteRows={(rs) => rs.filter((j) => !j.saved).forEach((j) => onRemoveJob(j.uid))}
          isDirty={(j) => !j.saved}
          rowError={(j) => j.error}
          onActiveChange={(j, col) => {
            if (j && col) setPicked({ uid: j.uid, col });
          }}
          cellStyle={(j, col) => {
            const c = j.colors?.cells?.[col] ?? j.colors?.row;
            return c ? tint(c) : undefined;
          }}
          onResize={(key, width, done) => onViewChange({ widths: { ...view.widths, [key]: width } }, done)}
          emptyText="No jobs yet — type in the ✱ row or click Add Job"
        />
      </CardContent>
    </Card>
  );
}
