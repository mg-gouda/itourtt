"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Small, non-interactive map with one pin, for a LOCATION chat message.
 * Loaded with next/dynamic (Leaflet touches `window`).
 */
export default function ChatLocationMap({
  latitude,
  longitude,
  accuracyM,
}: {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    }).setView([latitude, longitude], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    if (accuracyM && accuracyM > 0 && accuracyM < 2000) {
      L.circle([latitude, longitude], { radius: accuracyM, color: "#2563eb", weight: 1, fillOpacity: 0.12 }).addTo(map);
    }
    L.marker([latitude, longitude], {
      icon: L.divIcon({
        className: "",
        html:
          '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
          'background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      }),
      interactive: false,
    }).addTo(map);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [latitude, longitude, accuracyM]);

  return <div ref={ref} className="h-full w-full" aria-hidden />;
}
