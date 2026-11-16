"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPin, Phone, RefreshCw, Search, Wifi, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";
import { useLocaleId, useT } from "@/lib/i18n";
import { useServiceTypeLabel } from "@/lib/service-types";
import { cn } from "@/lib/utils";
import {
  FRESHNESS_COLOR,
  cairoDateTime,
  cairoTime,
  freshnessOf,
  relativeAge,
  type Freshness,
  type TrackedPerson,
} from "./types";

const TrackingMap = dynamic(() => import("./tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

const AUTO_REFRESH_MS = 60_000;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Case- and diacritic-insensitive name match. */
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const FRESHNESS_ORDER: Record<Freshness, number> = { live: 0, recent: 1, stale: 2, none: 3 };

interface TrackingViewProps {
  kind: "rep" | "driver";
}

/**
 * Rep Tracking / Driver Tracking: a map of every active rep (or driver) at
 * their last-known position, with a searchable list beside it.
 */
export function TrackingView({ kind }: TrackingViewProps) {
  const t = useT();
  const localeId = useLocaleId();
  const serviceTypeLabel = useServiceTypeLabel();
  const [people, setPeople] = useState<TrackedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number>(() => Date.now());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(kind === "rep" ? "/tracking/reps" : "/tracking/drivers");
      setPeople(Array.isArray(data?.data) ? data.data : []);
      setError(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? "403" : t("tracking.loadFailed"));
    } finally {
      setLoadedAt(Date.now());
      setLoading(false);
      setHasLoaded(true);
    }
  }, [kind, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const filtered = useMemo(() => {
    const q = norm(search);
    const list = q ? people.filter((p) => norm(p.name).includes(q)) : people;
    return [...list].sort(
      (a, b) =>
        FRESHNESS_ORDER[freshnessOf(a, loadedAt)] - FRESHNESS_ORDER[freshnessOf(b, loadedAt)] ||
        a.name.localeCompare(b.name),
    );
  }, [people, search, loadedAt]);

  // A single search hit is selected automatically; a selection hidden by the filter is dropped.
  useEffect(() => {
    if (filtered.length === 1 && search.trim()) setSelectedId(filtered[0].id);
    else if (selectedId && !filtered.some((p) => p.id === selectedId)) setSelectedId(null);
  }, [filtered, search, selectedId]);

  const counts = useMemo(() => {
    const c: Record<Freshness, number> = { live: 0, recent: 0, stale: 0, none: 0 };
    for (const p of people) c[freshnessOf(p, loadedAt)]++;
    return c;
  }, [people, loadedAt]);

  const popupHtml = useCallback(
    (p: TrackedPerson) => {
      const loc = p.location!;
      const jobs = p.todayJobs.length
        ? `<ul style="margin:4px 0 0;padding:0;list-style:none">${p.todayJobs
            .map(
              (j) =>
                `<li style="padding:2px 0;border-top:1px solid #eee"><b>${esc(j.internalRef)}</b> · ${esc(
                  serviceTypeLabel(j.serviceType),
                )}${j.time ? ` · ${esc(cairoTime(j.time, localeId))}` : ""}${
                  j.flightNo ? ` · ${esc(j.flightNo)}` : ""
                }<br/><span style="color:#666">${esc(j.legStatus.replace(/_/g, " "))}</span></li>`,
            )
            .join("")}</ul>`
        : `<div style="color:#666">${esc(t("tracking.noJobsToday"))}</div>`;
      return (
        `<div style="font:12px/1.45 system-ui,sans-serif">` +
        `<div style="font-weight:600;font-size:14px">${esc(p.name)}</div>` +
        `<div><a href="tel:${esc(p.mobileNumber)}">${esc(p.mobileNumber)}</a></div>` +
        `<div style="margin-top:6px"><b>${esc(t("tracking.lastSeen"))}:</b> ${esc(
          cairoDateTime(loc.recordedAt, localeId),
        )} (${esc(relativeAge(loc.recordedAt, Date.now(), t))})</div>` +
        (loc.accuracy != null
          ? `<div><b>${esc(t("tracking.accuracy"))}:</b> ±${esc(Math.round(loc.accuracy))} m</div>`
          : "") +
        `<div><b>${esc(t("tracking.source"))}:</b> ${esc(t(`tracking.source${loc.source}`))}</div>` +
        `<div style="margin-top:6px;font-weight:600">${esc(t("tracking.todayJobs"))}</div>${jobs}` +
        `<div style="margin-top:6px"><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${
          loc.latitude
        },${loc.longitude}">${esc(t("tracking.openInMaps"))} ↗</a></div>` +
        `</div>`
      );
    },
    [t, localeId, serviceTypeLabel],
  );

  const title = kind === "rep" ? t("tracking.repTitle") : t("tracking.driverTitle");

  if (error === "403") {
    return (
      <div className="space-y-4">
        <PageHeader title={title} />
        <Card className="p-8 text-center text-sm text-muted-foreground">403 — {t("tracking.loadFailed")}</Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title={title} description={kind === "rep" ? t("tracking.repDesc") : t("tracking.driverDesc")} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={kind === "rep" ? t("tracking.searchRep") : t("tracking.searchDriver")}
            className="pl-8 pr-8"
            autoFocus
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="outline">
            {t("tracking.total")}: {people.length}
          </Badge>
          {(["live", "recent", "stale", "none"] as Freshness[]).map((f) => (
            <Badge key={f} variant="outline" className="gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: FRESHNESS_COLOR[f] }} />
              {t(`tracking.${f === "none" ? "noLocation" : f}`)}: {counts[f]}
            </Badge>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            {t("tracking.autoRefresh")}
          </label>
          <span className="text-xs text-muted-foreground">
            {t("tracking.loadedAt")} {cairoTime(new Date(loadedAt).toISOString(), localeId)}
          </span>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {t("tracking.refresh")}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      {/* List + map */}
      <div className="grid min-h-[520px] flex-1 grid-cols-1 gap-4 lg:h-[calc(100vh-15rem)] lg:grid-cols-[320px_1fr]">
        <Card className="flex max-h-[40vh] flex-col overflow-hidden p-0 lg:max-h-none">
          <div className="flex-1 overflow-y-auto">
            {loading && !people.length ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{t("tracking.noMatches")}</div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((p) => {
                  const f = freshnessOf(p, loadedAt);
                  const selected = p.id === selectedId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!p.location}
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                          p.location ? "hover:bg-muted/60" : "cursor-default opacity-70",
                          selected && "bg-primary/10",
                        )}
                      >
                        <span
                          className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: FRESHNESS_COLOR[f] }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{p.name}</span>
                            {p.online && (
                              <Wifi className="h-3 w-3 shrink-0 text-green-600" aria-label={t("tracking.online")} />
                            )}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {p.mobileNumber}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {p.location ? (
                              <>
                                <MapPin className="mr-1 inline h-3 w-3" />
                                {relativeAge(p.location.recordedAt, loadedAt, t)} ·{" "}
                                {t(`tracking.source${p.location.source}`)}
                              </>
                            ) : p.hasAccount ? (
                              t("tracking.neverReported")
                            ) : (
                              t("tracking.noAccount")
                            )}
                          </span>
                        </span>
                        {p.todayJobs.length > 0 && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]" title={t("tracking.todayJobs")}>
                            {p.todayJobs.length}
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="border-t border-border p-2 text-[11px] leading-snug text-muted-foreground">{t("tracking.note")}</p>
        </Card>

        <Card className="relative min-h-[420px] overflow-hidden p-0">
          <TrackingMap
            people={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            popupHtml={popupHtml}
            fitKey={`${hasLoaded ? 1 : 0}|${norm(search)}`}
            now={loadedAt}
          />
        </Card>
      </div>
    </div>
  );
}
