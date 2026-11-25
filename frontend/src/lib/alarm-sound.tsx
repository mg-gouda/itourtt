"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BellRing } from "lucide-react";

/**
 * The job-alarm sound for the web (6.1.0) — the owner's pick, "two-tone" (public/sounds/job-alarm.wav).
 * Same sound as the rep / driver apps (res/raw/job_alarm.wav).
 *
 * - startAlarm(owner) loops it until every owner has called stopAlarm(owner) — an alarm rings until answered.
 * - playOnce() plays it once (a new notification) unless an alarm loop is already ringing.
 *
 * Browsers only let a page play sound after the person has clicked / tapped / typed on it. The first
 * interaction "unlocks" the player; if a sound is refused before that, <AlarmSoundGate /> shows a
 * "Turn on alarm sound" button that plays it from a click.
 */
const DEFAULT_SRC = "/sounds/job-alarm.wav";
let src = DEFAULT_SRC;
let audio: HTMLAudioElement | null = null;

/**
 * Company › Alerts (6.5.0): an uploaded alarm sound replaces the built-in one on the web
 * (portals + office popups). null = built-in. Takes effect from the next ring.
 */
const absolute = (url: string | null | undefined) =>
  url ? (url.startsWith("/uploads/") ? `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? ""}${url}` : url) : DEFAULT_SRC;

export function setAlarmSoundUrl(url: string | null | undefined) {
  const next = absolute(url);
  if (next === src) return;
  src = next;
  if (audio && audio.paused) audio = null; // rebuilt with the new source on the next ring
}

/**
 * One sound per alarm (6.8.0): kind (START_90 …) → that alarm's sound. Alarms without their own
 * sound use the shared one (setAlarmSoundUrl) or the built-in two-tone.
 */
const kindSrc = new Map<string, string>();
let lastKind: string | null = null;
export function setAlarmSounds(alarms: { kind: string; soundUrl?: string | null; last?: boolean }[] | null | undefined) {
  kindSrc.clear();
  for (const a of alarms ?? []) {
    if (a.soundUrl) kindSrc.set(a.kind, absolute(a.soundUrl));
    if (a.last) lastKind = a.kind;
  }
}
/** The sound for an alarm kind; WARN_* (the final office warning) uses the last alarm's sound. */
function srcFor(kind?: string | null) {
  if (!kind) return src;
  const k = kind.startsWith("WARN") && lastKind ? lastKind : kind;
  return kindSrc.get(k) ?? src;
}
/** Switch the player to another file (only while it is not ringing for someone else). */
function switchSrc(next: string) {
  if (audio && audio.src && new URL(next, window.location.href).href !== audio.src) {
    audio.pause();
    audio = null;
  }
  if (!audio) {
    audio = new Audio(next);
    audio.preload = "auto";
    audio.volume = 1;
  }
}
const owners = new Set<string>();
let blocked = false;
let unlocked = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function el() {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 1;
  }
  return audio;
}

function setBlocked(v: boolean) {
  if (blocked !== v) { blocked = v; emit(); }
}

async function play(loop: boolean) {
  const a = el();
  if (!a) return;
  a.loop = loop;
  if (!loop || a.paused) a.currentTime = 0;
  try {
    await a.play();
    setBlocked(false);
  } catch {
    // Autoplay refused until the person interacts with the page.
    setBlocked(true);
  }
}

/** Ring in a loop until stopAlarm(owner) — several alarms can share the one loop. `kind` picks that alarm's sound. */
export function startAlarm(owner: string, kind?: string | null) {
  if (owners.size === 0 && typeof window !== "undefined") switchSrc(srcFor(kind));
  owners.add(owner);
  void play(true);
}

export function stopAlarm(owner: string) {
  owners.delete(owner);
  if (owners.size === 0 && audio) {
    audio.pause();
    audio.loop = false;
    audio.currentTime = 0;
    setBlocked(false);
  }
}

/** One ring for a new notification (skipped while an alarm loop is ringing). `kind` picks that alarm's sound. */
export function playOnce(kind?: string | null) {
  if (owners.size > 0) return;
  if (typeof window !== "undefined") switchSrc(srcFor(kind));
  void play(false);
}

/** First click / tap / key on the page: prime the player so later alarms may sound. */
function installUnlock() {
  if (typeof window === "undefined" || unlocked) return;
  unlocked = true;
  const prime = () => {
    const a = el();
    if (!a) return;
    if (owners.size > 0) { void play(true); return; } // an alarm was waiting for this click
    const was = a.muted;
    a.muted = true;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = was; }).catch(() => { a.muted = was; });
    window.removeEventListener("pointerdown", prime);
    window.removeEventListener("keydown", prime);
  };
  window.addEventListener("pointerdown", prime);
  window.addEventListener("keydown", prime);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Mount once per signed-in layout: primes the sound and offers the button when the browser blocked it. */
export function AlarmSoundGate() {
  useEffect(() => { installUnlock(); }, []);
  const isBlocked = useSyncExternalStore(subscribe, () => blocked, () => false);
  if (!isBlocked) return null;
  return (
    <button
      type="button"
      onClick={() => void play(owners.size > 0)}
      className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-4 ring-red-600/25 animate-pulse"
    >
      <BellRing className="h-4 w-4" />
      Turn on alarm sound
    </button>
  );
}
