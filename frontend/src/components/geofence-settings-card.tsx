"use client";

import { useEffect, useState } from "react";
import { Loader2, Plane, Radar, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";

const MIN_M = 50;
const MAX_M = 50_000;

interface Radii {
  airportMeters: number;
  otherMeters: number;
}

const fmt = (m: number) => (m >= 1000 ? `${+(m / 1000).toFixed(2)} km` : `${m} m`);

/**
 * System Parameters › Locations: the rep/driver status geofence radii.
 * The backend reads these on every status update (common/geofence.util.ts) —
 * nothing about the radius is hard-coded any more.
 */
export function GeofenceSettingsCard() {
  const t = useT();
  const canEdit = usePermission("locations.geofenceEdit");
  const [saved, setSaved] = useState<Radii | null>(null);
  const [airport, setAirport] = useState("");
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Radii>("/settings/geofence")
      .then(({ data }) => {
        setSaved(data);
        setAirport(String(data.airportMeters));
        setOther(String(data.otherMeters));
      })
      .catch(() => toast.error(t("locations.geofenceLoadFailed")));
  }, [t]);

  const parse = (v: string) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= MIN_M && n <= MAX_M ? n : null;
  };
  const airportN = parse(airport);
  const otherN = parse(other);
  const valid = airportN != null && otherN != null;
  const dirty = !!saved && valid && (airportN !== saved.airportMeters || otherN !== saved.otherMeters);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const { data } = await api.patch<Radii>("/settings/geofence", {
        airportMeters: airportN,
        otherMeters: otherN,
      });
      setSaved(data);
      setAirport(String(data.airportMeters));
      setOther(String(data.otherMeters));
      toast.success(t("locations.geofenceSaved"));
    } catch {
      toast.error(t("locations.geofenceSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    id: string,
    icon: React.ReactNode,
    label: string,
    value: string,
    onChange: (v: string) => void,
    parsed: number | null,
  ) => (
    <div className="min-w-[180px] flex-1 space-y-1">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_M}
          max={MAX_M}
          step={50}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!saved || !canEdit || saving}
          aria-invalid={parsed == null}
          className="border-border bg-background pr-8 text-foreground aria-[invalid=true]:border-destructive"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          m
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        {parsed == null ? t("locations.geofenceRange") : fmt(parsed)}
      </p>
    </div>
  );

  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Radar className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">{t("locations.geofenceTitle")}</p>
            <p className="text-[11px] text-muted-foreground/70">{t("locations.geofenceDesc")}</p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {field(
              "geofence-airport",
              <Plane className="h-3.5 w-3.5" />,
              t("locations.geofenceAirport"),
              airport,
              setAirport,
              airportN,
            )}
            {field(
              "geofence-other",
              <Building2 className="h-3.5 w-3.5" />,
              t("locations.geofenceOther"),
              other,
              setOther,
              otherN,
            )}
            {canEdit && (
              <Button size="sm" className="mt-5" onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("locations.geofenceSave")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
