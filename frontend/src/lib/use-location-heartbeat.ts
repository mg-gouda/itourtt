"use client";

import { useEffect } from "react";
import api, { backgroundPoll } from "@/lib/api";

/** How often an open portal reports its position. */
const HEARTBEAT_MS = 60_000;

/**
 * Rep/driver portal heartbeat for the Rep Tracking / Driver Tracking maps.
 *
 * While the portal is open and visible it posts the device position to
 * `POST /tracking/ping` once a minute (and immediately when the tab comes back
 * into view). Sent as a background poll, so it never keeps an idle session
 * alive, and failures are silent — the GPS-stamped status actions surface
 * location problems to the user themselves.
 */
export function useLocationHeartbeat(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    let inFlight = false;

    const report = () => {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          inFlight = false;
          if (cancelled) return;
          api
            .post(
              "/tracking/ping",
              {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
                recordedAt: new Date(pos.timestamp).toISOString(),
              },
              backgroundPoll,
            )
            .catch(() => {
              /* telemetry only */
            });
        },
        () => {
          inFlight = false;
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
      );
    };

    report();
    const timer = setInterval(report, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") report();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
