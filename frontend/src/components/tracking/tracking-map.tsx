"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FRESHNESS_COLOR, freshnessOf, initials, type TrackedPerson } from "./types";

/** Egypt — used when nobody on the list has a position yet. */
const DEFAULT_CENTER: L.LatLngTuple = [26.8, 30.8];
const DEFAULT_ZOOM = 6;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
type BaseLayer = "Street" | "Satellite";
/** Per-browser memory of the Street/Satellite choice. */
const BASE_LAYER_KEY = "tracking-map-base-layer";

function readBaseLayer(): BaseLayer {
  try {
    return localStorage.getItem(BASE_LAYER_KEY) === "Satellite" ? "Satellite" : "Street";
  } catch {
    return "Street";
  }
}

interface TrackingMapProps {
  /** People to plot (those without a location are skipped). */
  people: TrackedPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Popup body as trusted HTML — callers must escape user data. */
  popupHtml: (p: TrackedPerson) => string;
  /** Re-fit the view whenever this value changes (e.g. the search text). */
  fitKey: string;
  now: number;
}

function markerIcon(p: TrackedPerson, now: number, selected: boolean): L.DivIcon {
  const color = FRESHNESS_COLOR[freshnessOf(p, now)];
  const size = selected ? 40 : 32;
  const ring = selected ? "0 0 0 4px rgba(37,99,235,.45)," : "";
  const html =
    `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};` +
    `color:#fff;font:600 ${selected ? 13 : 11}px/1 system-ui,sans-serif;display:flex;align-items:center;` +
    `justify-content:center;border:2px solid #fff;box-shadow:${ring}0 1px 4px rgba(0,0,0,.4);` +
    `opacity:${freshnessOf(p, now) === "stale" ? 0.75 : 1}">${initials(p.name).replace(/[<>&"]/g, "")}</div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

export default function TrackingMap({ people, selectedId, onSelect, popupHtml, fitKey, now }: TrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const accuracyRef = useRef<L.Circle | null>(null);
  const lastFitKey = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      DEFAULT_CENTER,
      DEFAULT_ZOOM,
    );
    // Street (OSM) / Satellite (Esri World Imagery + place-name labels) switch.
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const satellite = L.layerGroup([
      L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 19,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      }),
      L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 }),
    ]);
    const bases: Record<BaseLayer, L.Layer> = { Street: street, Satellite: satellite };
    bases[readBaseLayer()].addTo(map);
    L.control.layers(bases, undefined, { position: "topright", collapsed: false }).addTo(map);
    map.on("baselayerchange", (e: L.LayersControlEvent) => {
      try {
        localStorage.setItem(BASE_LAYER_KEY, e.name);
      } catch {
        /* storage unavailable — the choice just isn't remembered */
      }
    });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // The container's size can settle after mount (sidebar, flex layout).
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);
    const markers = markersRef.current;

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, []);

  // (Re)draw markers whenever the data, selection or clock changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    accuracyRef.current = null;

    const located = people.filter((p) => p.location);
    for (const p of located) {
      const { latitude, longitude } = p.location!;
      const selected = p.id === selectedId;
      const marker = L.marker([latitude, longitude], {
        icon: markerIcon(p, now, selected),
        title: p.name,
        zIndexOffset: selected ? 1000 : 0,
      })
        .bindPopup(popupHtml(p), { maxWidth: 300, minWidth: 220 })
        .on("click", () => onSelectRef.current(p.id));
      marker.addTo(layer);
      markersRef.current.set(p.id, marker);
    }

    const sel = selectedId ? located.find((p) => p.id === selectedId) : undefined;
    if (sel?.location?.accuracy && sel.location.accuracy > 0) {
      accuracyRef.current = L.circle([sel.location.latitude, sel.location.longitude], {
        radius: sel.location.accuracy,
        color: "#2563eb",
        weight: 1,
        fillOpacity: 0.08,
      }).addTo(layer);
    }

    // Keep the selected person's popup open across refreshes.
    if (selectedId) markersRef.current.get(selectedId)?.openPopup();

    // Fit to what's shown when the filter changes (not on every refresh,
    // so a dispatcher's own pan/zoom survives auto-refresh).
    if (lastFitKey.current !== fitKey) {
      lastFitKey.current = fitKey;
      if (located.length === 1) {
        map.setView([located[0].location!.latitude, located[0].location!.longitude], 15);
      } else if (located.length > 1) {
        map.fitBounds(
          L.latLngBounds(located.map((p) => [p.location!.latitude, p.location!.longitude] as L.LatLngTuple)),
          { padding: [40, 40], maxZoom: 15 },
        );
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    }
  }, [people, selectedId, popupHtml, fitKey, now]);

  // Fly to and open the selected person.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (!marker) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
    marker.openPopup();
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full rounded-lg" style={{ zIndex: 0 }} />;
}
