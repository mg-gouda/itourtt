"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, MapPin, AlertTriangle } from "lucide-react";
import api, { backgroundPoll } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { formatTimeCairo } from "@/lib/utils";

/**
 * Job alarms for the rep / driver web portals (the native apps have the same
 * rules in mobile/packages/shared/src/native/job-alerts.ts):
 *
 * - START_90 / START_60 / START_30 — 1 h 30, 1 h and 30 min before each job that has
 *   not started; all three ring. Answered with "On the way", which sends the
 *   phone's location; the office gets an alert for each (5.10).
 * - DROPOFF_ARRIVED / DROPOFF_LEFT — a driver on a started trip, or a rep who
 *   escorts the transfer: entering the drop-off geofence asks them to complete
 *   the job before leaving; leaving it without completing raises an alarm.
 *
 * The server decides which jobs qualify (GET /{portal}-portal/alerts); the
 * browser only times the reminders and watches the GPS.
 */

type Kind = "START_90" | "START_60" | "START_30" | "DROPOFF_ARRIVED" | "DROPOFF_LEFT";
const START_TITLE: Record<string, string> = { START_90: "alarm.startsIn90", START_60: "alarm.startsIn60", START_30: "alarm.startsIn30" };

interface AlertJob {
  jobId: string;
  internalRef: string;
  serviceType: string;
  startsAt: string | null;
  flightNo: string | null;
  paxCount: number;
  clientName: string | null;
  from: string | null;
  to: string | null;
  acked: string[];
  target?: { lat: number; lng: number; label: string; precise: boolean; radiusMeters: number };
}

interface Alarm {
  kind: Kind;
  job: AlertJob;
  shownAt: string;
}

const POLL_MS = 30_000;
const TICK_MS = 15_000;
const INSIDE_KEY = "itour_dropoff_inside";

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Which start alarm is due now: each of 1:30 / 1:00 / 0:30 rings in its own window. */
export function dueStartKind(startsAt: string | null, now = Date.now()): Kind | null {
  if (!startsAt) return null;
  const mins = (new Date(startsAt).getTime() - now) / 60_000;
  if (mins <= 0) return null;
  if (mins <= 30) return "START_30";
  if (mins <= 60) return "START_60";
  if (mins <= 90) return "START_90";
  return null;
}

function readInside(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(INSIDE_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeInside(v: Record<string, boolean>) {
  try {
    localStorage.setItem(INSIDE_KEY, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

/** Short repeating chime until the alarm is acknowledged. */
function useChime(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext | null = null;
    const ring = () => {
      try {
        ctx ??= Ctx ? new Ctx() : null;
        if (!ctx) return;
        [0, 0.25].forEach((offset) => {
          const osc = ctx!.createOscillator();
          const gain = ctx!.createGain();
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, ctx!.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx!.currentTime + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx!.currentTime + offset + 0.2);
          osc.connect(gain).connect(ctx!.destination);
          osc.start(ctx!.currentTime + offset);
          osc.stop(ctx!.currentTime + offset + 0.22);
        });
      } catch {
        /* autoplay blocked until the user interacts */
      }
      navigator.vibrate?.([300, 150, 300]);
    };
    ring();
    const id = setInterval(ring, 6_000);
    return () => {
      clearInterval(id);
      ctx?.close().catch(() => {});
    };
  }, [active]);
}

/** Show a system notification too when the tab is in the background. */
async function systemNotify(title: string, body: string, tag: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, requireInteraction: true });
    else new Notification(title, { body, tag });
  } catch {
    /* not supported */
  }
}

export function JobAlarms({ portal }: { portal: "rep" | "driver" }) {
  const t = useT();
  const [reminders, setReminders] = useState<AlertJob[]>([]);
  const [dropoffs, setDropoffs] = useState<AlertJob[]>([]);
  const [queue, setQueue] = useState<Alarm[]>([]);
  const [acking, setAcking] = useState(false);
  const [, setTick] = useState(0);
  // Alarms already raised this session (until the server confirms the ack).
  const raised = useRef(new Set<string>());
  const position = useRef<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/${portal}-portal/alerts`, backgroundPoll);
      const d = data?.data ?? data;
      setReminders(d?.reminders ?? []);
      setDropoffs(d?.dropoffs ?? []);
    } catch {
      /* next poll */
    }
  }, [portal]);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), TICK_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const raise = useCallback(
    (kind: Kind, job: AlertJob) => {
      const key = `${job.jobId}:${kind}`;
      if (raised.current.has(key) || job.acked.includes(kind)) return;
      raised.current.add(key);
      setQueue((q) => [...q, { kind, job, shownAt: new Date().toISOString() }]);
      const title = kind.startsWith("START")
        ? t(START_TITLE[kind])
        : t(kind === "DROPOFF_ARRIVED" ? "alarm.dropoffArrivedTitle" : "alarm.dropoffLeftTitle");
      systemNotify(`${title} · ${job.internalRef}`, [job.from, job.to].filter(Boolean).join(" → "), key);
    },
    [t],
  );

  // Start reminders, re-evaluated on every tick.
  useEffect(() => {
    for (const job of reminders) {
      const kind = dueStartKind(job.startsAt);
      if (!kind) continue;
      raise(kind, job);
    }
  });

  // Drop-off geofence: watch GPS only while a leg is running.
  const watched = useMemo(() => dropoffs.filter((d) => d.target?.precise), [dropoffs]);
  useEffect(() => {
    if (!watched.length || typeof navigator === "undefined" || !navigator.geolocation) return;
    const check = (pos: GeolocationPosition) => {
      position.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const inside = readInside();
      for (const job of watched) {
        const target = job.target!;
        const dist = distanceMeters(position.current, target);
        const isInside = dist <= target.radiusMeters;
        if (isInside) {
          inside[job.jobId] = true;
          raise("DROPOFF_ARRIVED", job);
        } else if (inside[job.jobId]) {
          // Was at the drop-off, now outside it and the job is still open.
          raise("DROPOFF_LEFT", job);
        }
      }
      // Forget jobs that are no longer running.
      const live = new Set(watched.map((j) => j.jobId));
      Object.keys(inside).forEach((id) => !live.has(id) && delete inside[id]);
      writeInside(inside);
    };
    const id = navigator.geolocation.watchPosition(check, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 20_000,
      timeout: 60_000,
    });
    return () => navigator.geolocation.clearWatch(id);
  }, [watched, raise]);

  const current = queue[0];
  useChime(!!current);

  const acknowledge = async () => {
    if (!current) return;
    setAcking(true);
    try {
      // "On the way": read where the phone is now (drop-off alarms already track it).
      if (current.kind.startsWith("START") && typeof navigator !== "undefined" && navigator.geolocation) {
        const fix = await new Promise<GeolocationPosition | null>((resolve) =>
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
            enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000,
          }),
        );
        if (fix) position.current = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      }
      await api.post(`/${portal}-portal/jobs/${current.job.jobId}/alerts/ack`, {
        kind: current.kind,
        shownAt: current.shownAt,
        ...(position.current ? { latitude: position.current.lat, longitude: position.current.lng } : {}),
      });
      setReminders((rs) =>
        rs.map((r) => (r.jobId === current.job.jobId ? { ...r, acked: [...r.acked, current.kind] } : r)),
      );
    } catch {
      /* stays acknowledged locally; the next poll re-syncs */
    } finally {
      setAcking(false);
      setQueue((q) => q.slice(1));
    }
  };

  if (!current) return null;
  const { kind, job } = current;
  const isStart = kind.startsWith("START");
  const Icon = isStart ? AlarmClock : kind === "DROPOFF_LEFT" ? AlertTriangle : MapPin;
  const tone = kind === "DROPOFF_LEFT" ? "text-red-500" : "text-amber-400";
  const title = isStart
    ? t(START_TITLE[kind])
    : t(kind === "DROPOFF_ARRIVED" ? "alarm.dropoffArrivedTitle" : "alarm.dropoffLeftTitle");
  const desc = isStart
    ? t("alarm.startDesc").replace("{ref}", job.internalRef)
    : t(kind === "DROPOFF_ARRIVED" ? "alarm.dropoffArrivedDesc" : "alarm.dropoffLeftDesc").replace("{ref}", job.internalRef);

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${tone}`} />
            {title}
          </DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <Field label={t("alarm.job")} value={job.internalRef} />
          <Field label={t("alarm.startTime")} value={job.startsAt ? (formatTimeCairo(job.startsAt) ?? "—") : "—"} />
          {job.flightNo ? <Field label={t("alarm.flight")} value={job.flightNo} /> : null}
          <Field label={t("alarm.pax")} value={String(job.paxCount ?? "—")} />
          <div className="col-span-2">
            <Field label={t("alarm.route")} value={[job.from, job.to].filter(Boolean).join(" → ") || "—"} />
          </div>
          {!isStart && job.target ? (
            <div className="col-span-2">
              <Field label={t("alarm.dropoff")} value={job.target.label} />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={acknowledge} disabled={acking} className="w-full sm:w-auto">
            {isStart ? t("alarm.onTheWay") : t("alarm.acknowledge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
