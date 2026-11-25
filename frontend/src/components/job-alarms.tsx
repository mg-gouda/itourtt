"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, MapPin, AlertTriangle, Loader2 } from "lucide-react";
import api, { backgroundPoll } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatTimeCairo } from "@/lib/utils";
import { startAlarm, stopAlarm, setAlarmSoundUrl } from "@/lib/alarm-sound";

/**
 * Job alarms for the rep / driver web portals (the native apps have the same
 * rules in mobile/packages/shared/src/native/job-alerts.ts):
 *
 * - START_<minutes> — the start alarms set in Company › Alerts (built-in: 90 / 60 / 30 min
 *   before each job not yet started). The earlier ones are answered "Seen", the last one
 *   "On the way" with the phone's location; the office gets an alert for each (6.5.0).
 * - DROPOFF_ARRIVED / DROPOFF_LEFT — a driver on a started trip, or a rep who
 *   escorts the transfer: entering the drop-off geofence asks them to complete
 *   the job before leaving; leaving it without completing raises an alarm.
 *
 * The server decides which jobs qualify (GET /{portal}-portal/alerts); the
 * browser only times the reminders and watches the GPS.
 */

interface StartAlarm {
  kind: string;
  minutes: number;
  last: boolean;
}

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
  kind: string;
  job: AlertJob;
  shownAt: string;
}

const POLL_MS = 30_000;
const TICK_MS = 15_000;
const INSIDE_KEY = "itour_dropoff_inside";
const PENDING_KEY = "itour_alarm_answers_pending";
const RETRY_MS = 20_000;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Built-in alarms, used until the server sends the Company › Alerts list. */
const DEFAULT_ALARMS: StartAlarm[] = [
  { kind: "START_90", minutes: 90, last: false },
  { kind: "START_60", minutes: 60, last: false },
  { kind: "START_30", minutes: 30, last: true },
];

/** Which start alarm is due now: each alarm rings from its time until the next one's. */
export function dueStartKind(startsAt: string | null, alarms: StartAlarm[] = DEFAULT_ALARMS, now = Date.now()): StartAlarm | null {
  if (!startsAt) return null;
  const mins = (new Date(startsAt).getTime() - now) / 60_000;
  if (mins <= 0) return null;
  const ordered = [...alarms].sort((a, b) => a.minutes - b.minutes); // nearest first
  for (const a of ordered) if (mins <= a.minutes) return a;
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

// ── Answers waiting to reach the office (UI review 2b) ─────────────────────
interface PendingAck {
  portal: "rep" | "driver";
  jobId: string;
  kind: string;
  shownAt: string;
  answer?: "SEEN" | "ON_THE_WAY";
  latitude?: number;
  longitude?: number;
  tries: number;
}
function readPending(): PendingAck[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writePending(v: PendingAck[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(v));
  } catch {
    /* private mode: stays in memory for this page */
  }
}

/** The alarm sound loops until the alarm is answered; phones also vibrate. */
function useChime(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    startAlarm("portal-job-alarm");
    const buzz = () => navigator.vibrate?.([300, 150, 300]);
    buzz();
    const id = setInterval(buzz, 3_000);
    return () => {
      clearInterval(id);
      navigator.vibrate?.(0);
      stopAlarm("portal-job-alarm");
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

function minutesText(m: number, t: (k: string) => string) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return t("alarm.min").replace("{n}", String(r));
  if (!r) return t("alarm.hours").replace("{n}", String(h));
  return t("alarm.hoursMin").replace("{h}", String(h)).replace("{m}", String(r));
}

export function JobAlarms({ portal }: { portal: "rep" | "driver" }) {
  const t = useT();
  const [reminders, setReminders] = useState<AlertJob[]>([]);
  const [dropoffs, setDropoffs] = useState<AlertJob[]>([]);
  const [alarms, setAlarms] = useState<StartAlarm[]>(DEFAULT_ALARMS);
  const [queue, setQueue] = useState<Alarm[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [, setTick] = useState(0);
  // Alarms already raised this session (until the server confirms the ack).
  const raised = useRef(new Set<string>());
  const position = useRef<{ lat: number; lng: number } | null>(null);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/${portal}-portal/alerts`, backgroundPoll);
      const d = data?.data ?? data;
      setReminders(d?.reminders ?? []);
      setDropoffs(d?.dropoffs ?? []);
      if (Array.isArray(d?.alarms) && d.alarms.length) setAlarms(d.alarms);
      setAlarmSoundUrl(d?.soundUrl ?? null);
    } catch {
      /* next poll */
    }
  }, [portal]);

  /** Send every queued answer; failures stay queued for the next try. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const left: PendingAck[] = [];
      for (const p of readPending()) {
        if (p.portal !== portal) { left.push(p); continue; }
        try {
          await api.post(`/${p.portal}-portal/jobs/${p.jobId}/alerts/ack`, {
            kind: p.kind,
            shownAt: p.shownAt,
            ...(p.answer ? { answer: p.answer } : {}),
            ...(p.latitude != null && p.longitude != null ? { latitude: p.latitude, longitude: p.longitude } : {}),
          }, backgroundPoll);
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          // 4xx other than 401/408/429 = the job is gone / not ours: drop it. Network or 5xx: keep.
          if (status && status >= 400 && status < 500 && ![401, 408, 429].includes(status)) continue;
          left.push({ ...p, tries: p.tries + 1 });
        }
      }
      writePending(left);
      setPendingCount(left.filter((p) => p.portal === portal).length);
    } finally {
      flushing.current = false;
    }
  }, [portal]);

  useEffect(() => {
    load();
    flush();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), TICK_MS);
    const retry = setInterval(flush, RETRY_MS);
    const onVisible = () => document.visibilityState === "visible" && (load(), flush());
    const onOnline = () => flush();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      clearInterval(retry);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [load, flush]);

  const raise = useCallback(
    (kind: string, job: AlertJob, title: string) => {
      const key = `${job.jobId}:${kind}`;
      if (raised.current.has(key) || job.acked.includes(kind)) return;
      // Answered on this phone but not yet delivered: don't ring again.
      if (readPending().some((p) => p.jobId === job.jobId && p.kind === kind)) return;
      raised.current.add(key);
      setQueue((q) => [...q, { kind, job, shownAt: new Date().toISOString() }]);
      systemNotify(`${title} · ${job.internalRef}`, [job.from, job.to].filter(Boolean).join(" → "), key);
    },
    [],
  );

  // Start reminders, re-evaluated on every tick.
  useEffect(() => {
    for (const job of reminders) {
      const due = dueStartKind(job.startsAt, alarms);
      if (!due) continue;
      raise(due.kind, job, t("alarm.startsInX").replace("{time}", minutesText(due.minutes, t)));
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
          raise("DROPOFF_ARRIVED", job, t("alarm.dropoffArrivedTitle"));
        } else if (inside[job.jobId]) {
          // Was at the drop-off, now outside it and the job is still open.
          raise("DROPOFF_LEFT", job, t("alarm.dropoffLeftTitle"));
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
  }, [watched, raise, t]);

  const current = queue[0];
  useChime(!!current);

  /**
   * UI review 2a/2b: the alarm closes at once. The answer is queued on the phone and sent in
   * the background (with the location for "On the way" when the phone gives one within 8 s);
   * if it cannot reach the office it is retried until it does, and the phone says so.
   */
  const answer = () => {
    if (!current) return;
    const { kind, job, shownAt } = current;
    const startAlarm = alarms.find((a) => a.kind === kind);
    const isStart = kind.startsWith("START");
    const ans: PendingAck["answer"] = isStart ? (startAlarm && !startAlarm.last ? "SEEN" : "ON_THE_WAY") : undefined;
    setQueue((q) => q.slice(1));
    setReminders((rs) => rs.map((r) => (r.jobId === job.jobId ? { ...r, acked: [...r.acked, kind] } : r)));

    const enqueue = (pos: { lat: number; lng: number } | null) => {
      const p: PendingAck = {
        portal, jobId: job.jobId, kind, shownAt, answer: ans, tries: 0,
        ...(pos ? { latitude: pos.lat, longitude: pos.lng } : {}),
      };
      writePending([...readPending().filter((x) => !(x.jobId === p.jobId && x.kind === p.kind)), p]);
      setPendingCount((n) => n + 1);
      void flush();
    };
    if (ans === "ON_THE_WAY" && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (fix) => enqueue({ lat: fix.coords.latitude, lng: fix.coords.longitude }),
        () => enqueue(position.current),
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
      );
    } else {
      enqueue(position.current);
    }
  };

  const pendingNote = pendingCount > 0 && !current ? (
    <div role="status" className="fixed inset-x-3 bottom-24 z-[70] flex items-center gap-2 rounded-xl border border-amber-500/60 bg-amber-950 px-3 py-2.5 text-sm text-amber-100 shadow-lg">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      <span className="flex-1">{t("alarm.pendingSend")}</span>
    </div>
  ) : null;

  if (!current) return pendingNote;
  const { kind, job } = current;
  const isStart = kind.startsWith("START");
  const startAlarm = alarms.find((a) => a.kind === kind);
  const isLast = !isStart || !startAlarm || startAlarm.last;
  // Urgency colours: earlier reminders amber, the last one and "left without completing" red.
  const urgent = kind === "DROPOFF_LEFT" || (isStart && isLast);
  const Icon = isStart ? AlarmClock : kind === "DROPOFF_LEFT" ? AlertTriangle : MapPin;
  const minsLeft = job.startsAt ? Math.max(0, Math.round((new Date(job.startsAt).getTime() - Date.now()) / 60_000)) : null;
  const title = isStart
    ? t("alarm.pickupIn")
    : t(kind === "DROPOFF_ARRIVED" ? "alarm.dropoffArrivedTitle" : "alarm.dropoffLeftTitle");
  const buttonLabel = isStart ? (isLast ? t("alarm.onTheWay") : t("alarm.seen")) : t("alarm.acknowledge");

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="job-alarm-title"
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center px-6 text-center text-white ${urgent ? "bg-red-800" : "bg-amber-800"}`}
      style={{ pointerEvents: "auto" }}
    >
      <Icon className="h-14 w-14" aria-hidden="true" />
      <p id="job-alarm-title" className="mt-3 text-lg font-semibold opacity-90">{title}</p>
      {isStart && minsLeft !== null && (
        <p className="font-mono text-6xl font-black leading-none tabular-nums">{minutesText(minsLeft, t)}</p>
      )}
      <div className="mt-5 space-y-1 text-lg">
        <p className="font-mono font-bold">{job.internalRef}</p>
        {(job.from || job.to) && <p>{[job.from, job.to].filter(Boolean).join(" → ")}</p>}
        <p className="opacity-90">
          {job.startsAt ? `${t("alarm.startTime")} ${formatTimeCairo(job.startsAt) ?? "—"}` : ""}
          {job.flightNo ? ` · ${job.flightNo}` : ""}
          {job.paxCount ? ` · ${job.paxCount} ${t("alarm.pax")}` : ""}
        </p>
        {!isStart && job.target && <p className="opacity-90">{job.target.label}</p>}
      </div>
      <button
        type="button"
        onClick={answer}
        autoFocus
        className={`mt-8 flex h-[68px] w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-white text-xl font-black shadow-lg active:scale-[0.98] ${urgent ? "text-red-800" : "text-amber-900"}`}
      >
        {buttonLabel}
      </button>
      {isStart && !isLast && <p className="mt-3 text-sm opacity-85">{t("alarm.seenHint")}</p>}
    </div>
  );
}
