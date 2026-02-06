"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronRight,
  MapPin,
  Plus,
  Trash2,
  Loader2,
  Building,
  Globe,
  Map,
  Hotel as HotelIcon,
} from "lucide-react";
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
import api from "@/lib/api";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────
interface HotelNode {
  id: string;
  name: string;
}

interface ZoneNode {
  id: string;
  name: string;
  hotels: HotelNode[];
}

interface CityNode {
  id: string;
  name: string;
  zones: ZoneNode[];
}

interface AirportNode {
  id: string;
  name: string;
  code: string;
  cities: CityNode[];
}

interface CountryNode {
  id: string;
  name: string;
  code: string;
  airports: AirportNode[];
}

type LocationLevel = "country" | "airport" | "city" | "zone" | "hotel";

interface AddDialogState {
  open: boolean;
  level: LocationLevel;
  parentId: string;
  parentLabel: string;
}

// ─── Level config ───────────────────────────────────────────────
const LEVEL_CONFIG: Record<
  LocationLevel,
  {
    label: string;
    icon: React.ElementType;
    hasCode: boolean;
    endpoint: string;
    parentKey?: string;
    childLevel?: LocationLevel;
    childLabel?: string;
  }
> = {
  country: {
    label: "Country",
    icon: Globe,
    hasCode: true,
    endpoint: "/locations/countries",
    childLevel: "airport",
    childLabel: "Airport",
  },
  airport: {
    label: "Airport",
    icon: Building,
    hasCode: true,
    endpoint: "/locations/airports",
    parentKey: "countryId",
    childLevel: "city",
    childLabel: "City",
  },
  city: {
    label: "City",
    icon: Map,
    hasCode: false,
    endpoint: "/locations/cities",
    parentKey: "airportId",
    childLevel: "zone",
    childLabel: "Zone",
  },
  zone: {
    label: "Zone",
    icon: MapPin,
    hasCode: false,
    endpoint: "/locations/zones",
    parentKey: "cityId",
    childLevel: "hotel",
    childLabel: "Hotel",
  },
  hotel: {
    label: "Hotel",
    icon: HotelIcon,
    hasCode: false,
    endpoint: "/locations/hotels",
    parentKey: "zoneId",
  },
};

// ─── Tree row component ─────────────────────────────────────────
function TreeRow({
  icon: Icon,
  name,
  code,
  depth,
  hasChildren,
  expanded,
  onToggle,
  onAddChild,
  childLabel,
  onDelete,
}: {
  icon: React.ElementType;
  name: string;
  code?: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAddChild?: () => void;
  childLabel?: string;
  onDelete?: () => void;
}) {
  const paddingLeft = depth * 20;

  return (
    <div
      className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
      style={{ paddingLeft: `${paddingLeft + 8}px` }}
    >
      {/* Expand/collapse toggle */}
      {hasChildren ? (
        <button
          onClick={onToggle}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}

      {/* Add child button (visible on hover, before name) */}
      {onAddChild && childLabel && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddChild();
          }}
          title={`Add ${childLabel}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Delete button (visible on hover, before name) */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Icon */}
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

      {/* Name */}
      <span className="truncate text-sm text-foreground">{name}</span>

      {/* Code badge */}
      {code && (
        <Badge
          variant="secondary"
          className="ml-1 bg-secondary text-[10px] text-muted-foreground"
        >
          {code}
        </Badge>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────
export default function LocationsPage() {
  const [countries, setCountries] = useState<CountryNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Expanded state keyed by "level-id"
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Add dialog
  const [dialog, setDialog] = useState<AddDialogState>({
    open: false,
    level: "country",
    parentId: "",
    parentLabel: "",
  });
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    level: LocationLevel;
    id: string;
    name: string;
  }>({ open: false, level: "country", id: "", name: "" });
  const [deleting, setDeleting] = useState(false);

  // ─── Fetch tree ─────────────────────────────────────────────
  const fetchTree = useCallback(async () => {
    try {
      const { data } = await api.get("/locations/tree");
      const tree = Array.isArray(data) ? data : data.data ?? data.countries ?? [];
      setCountries(tree);
    } catch {
      toast.error("Failed to load location tree");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // ─── Toggle expansion ──────────────────────────────────────
  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ─── Open add dialog ──────────────────────────────────────
  function openAdd(level: LocationLevel, parentId: string, parentLabel: string) {
    setDialog({ open: true, level, parentId, parentLabel });
    setFormName("");
    setFormCode("");
  }

  // ─── Submit new location ──────────────────────────────────
  async function handleSubmit() {
    const config = LEVEL_CONFIG[dialog.level];
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (config.hasCode && !formCode.trim()) {
      toast.error("Code is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, string> = { name: formName.trim() };
      if (config.hasCode) {
        payload.code = formCode.trim().toUpperCase();
      }
      if (config.parentKey && dialog.parentId) {
        payload[config.parentKey] = dialog.parentId;
      }

      await api.post(config.endpoint, payload);
      toast.success(`${config.label} created successfully`);
      setDialog((prev) => ({ ...prev, open: false }));
      await fetchTree();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || `Failed to create ${config.label.toLowerCase()}`;
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Delete handler ─────────────────────────────────────────
  function confirmDelete(level: LocationLevel, id: string, name: string) {
    setDeleteDialog({ open: true, level, id, name });
  }

  async function handleDelete() {
    const { level, id } = deleteDialog;
    const endpoint = `${LEVEL_CONFIG[level].endpoint}/${id}`;
    setDeleting(true);
    try {
      await api.delete(endpoint);
      toast.success(`${LEVEL_CONFIG[level].label} deleted successfully`);
      setDeleteDialog((prev) => ({ ...prev, open: false }));
      await fetchTree();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || `Failed to delete ${LEVEL_CONFIG[level].label.toLowerCase()}`;
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────
  const currentConfig = LEVEL_CONFIG[dialog.level];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Manage the location tree: Country, Airport, City, Zone, Hotel"
        action={{
          label: "Add Country",
          onClick: () => openAdd("country", "", ""),
        }}
      />

      <Card className="border-border bg-card p-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : countries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Globe className="mb-3 h-10 w-10" />
            <p className="text-sm">No locations yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Add a country to get started
            </p>
          </div>
        ) : (
          <div className="py-2">
            {countries.map((country) => {
              const countryKey = `country-${country.id}`;
              const countryExpanded = !!expanded[countryKey];

              return (
                <div key={country.id}>
                  {/* Country */}
                  <TreeRow
                    icon={Globe}
                    name={country.name}
                    code={country.code}
                    depth={0}
                    hasChildren={country.airports.length > 0}
                    expanded={countryExpanded}
                    onToggle={() => toggle(countryKey)}
                    onAddChild={() =>
                      openAdd("airport", country.id, country.name)
                    }
                    childLabel="Airport"
                    onDelete={() =>
                      confirmDelete("country", country.id, country.name)
                    }
                  />

                  {/* Airports */}
                  {countryExpanded &&
                    country.airports.map((airport) => {
                      const airportKey = `airport-${airport.id}`;
                      const airportExpanded = !!expanded[airportKey];

                      return (
                        <div key={airport.id}>
                          <TreeRow
                            icon={Building}
                            name={airport.name}
                            code={airport.code}
                            depth={1}
                            hasChildren={airport.cities.length > 0}
                            expanded={airportExpanded}
                            onToggle={() => toggle(airportKey)}
                            onAddChild={() =>
                              openAdd("city", airport.id, airport.name)
                            }
                            childLabel="City"
                            onDelete={() =>
                              confirmDelete("airport", airport.id, airport.name)
                            }
                          />

                          {/* Cities */}
                          {airportExpanded &&
                            airport.cities.map((city) => {
                              const cityKey = `city-${city.id}`;
                              const cityExpanded = !!expanded[cityKey];

                              return (
                                <div key={city.id}>
                                  <TreeRow
                                    icon={Map}
                                    name={city.name}
                                    depth={2}
                                    hasChildren={city.zones.length > 0}
                                    expanded={cityExpanded}
                                    onToggle={() => toggle(cityKey)}
                                    onAddChild={() =>
                                      openAdd("zone", city.id, city.name)
                                    }
                                    childLabel="Zone"
                                    onDelete={() =>
                                      confirmDelete("city", city.id, city.name)
                                    }
                                  />

                                  {/* Zones */}
                                  {cityExpanded &&
                                    city.zones.map((zone) => {
                                      const zoneKey = `zone-${zone.id}`;
                                      const zoneExpanded = !!expanded[zoneKey];

                                      return (
                                        <div key={zone.id}>
                                          <TreeRow
                                            icon={MapPin}
                                            name={zone.name}
                                            depth={3}
                                            hasChildren={
                                              zone.hotels.length > 0
                                            }
                                            expanded={zoneExpanded}
                                            onToggle={() => toggle(zoneKey)}
                                            onAddChild={() =>
                                              openAdd(
                                                "hotel",
                                                zone.id,
                                                zone.name
                                              )
                                            }
                                            childLabel="Hotel"
                                            onDelete={() =>
                                              confirmDelete(
                                                "zone",
                                                zone.id,
                                                zone.name
                                              )
                                            }
                                          />

                                          {/* Hotels */}
                                          {zoneExpanded &&
                                            zone.hotels.map((hotel) => (
                                              <TreeRow
                                                key={hotel.id}
                                                icon={HotelIcon}
                                                name={hotel.name}
                                                depth={4}
                                                hasChildren={false}
                                                expanded={false}
                                                onToggle={() => {}}
                                                onDelete={() =>
                                                  confirmDelete(
                                                    "hotel",
                                                    hotel.id,
                                                    hotel.name
                                                  )
                                                }
                                              />
                                            ))}
                                        </div>
                                      );
                                    })}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Add dialog ──────────────────────────────────────── */}
      <Dialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add {currentConfig.label}
              {dialog.parentLabel && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  in {dialog.parentLabel}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name field */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input
                placeholder={`${currentConfig.label} name`}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
            </div>

            {/* Code field (only for country and airport) */}
            {currentConfig.hasCode && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Code</Label>
                <Input
                  placeholder={
                    dialog.level === "country" ? "e.g. EG" : "e.g. CAI"
                  }
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  maxLength={dialog.level === "country" ? 3 : 10}
                  className="border-border bg-card text-foreground uppercase placeholder:text-muted-foreground placeholder:normal-case"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog((prev) => ({ ...prev, open: false }))}
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation dialog ───────────────────────── */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {LEVEL_CONFIG[deleteDialog.level].label}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong className="text-foreground">{deleteDialog.name}</strong>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialog((prev) => ({ ...prev, open: false }))
              }
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
