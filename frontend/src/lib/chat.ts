"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api, { backgroundPoll } from "@/lib/api";

// ─── Types (mirror backend/src/chat/chat.service.ts) ─────────────────────────

export type ChatKind = "TEXT" | "IMAGE" | "VOICE";

export interface ChatPerson {
  userId: string;
  name: string;
  role: string;
  roleName: string;
  online: boolean;
  active: boolean;
}

export interface ChatConversationSummary {
  id: string;
  portalRole: "REP" | "DRIVER";
  other: ChatPerson;
  lastMessage: { kind: ChatKind; body: string | null; fromMe: boolean; createdAt: string } | null;
  unread: number;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  kind: ChatKind;
  body: string | null;
  hasAttachment: boolean;
  attachmentMime: string | null;
  attachmentSize: number | null;
  durationSec: number | null;
  createdAt: string;
  /** Client-only: still uploading / failed to send. */
  pending?: boolean;
  failed?: boolean;
  /** Client-only: local preview of an outgoing attachment. */
  localUrl?: string;
}

export interface ChatMe {
  enabled: boolean;
  side?: "PORTAL" | "STAFF";
  canStartWith?: ("REP" | "DRIVER")[];
  unreadTotal?: number;
  latestUnread?: { conversationId: string; at: string } | null;
}

/** How often the badge / widget checks for new messages. */
export const CHAT_ME_POLL_MS = 10_000;
/** How often an open thread checks for new messages. */
export const CHAT_THREAD_POLL_MS = 4_000;
export const CHAT_MAX_VOICE_SEC = 300;
export const CHAT_MAX_FILE_BYTES = 10 * 1024 * 1024;

// ─── Polling the caller's chat status ────────────────────────────────────────

/**
 * Polls GET /chat/me as a background request (it never keeps a rep/driver
 * session alive). Pauses while the tab is hidden and refreshes on return.
 */
export function useChatMe(enabled = true, onUpdate?: (me: ChatMe) => void) {
  const [me, setMe] = useState<ChatMe | null>(null);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/me", backgroundPoll);
      const next: ChatMe | null = data?.data ?? null;
      setMe(next);
      if (next) onUpdateRef.current?.(next);
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(load, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, CHAT_ME_POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, load]);

  return { me, reload: load };
}

// ─── Attachments (auth-gated → fetched as blobs) ─────────────────────────────

const blobCache = new Map<string, Promise<string>>();

/** Object URL for a message attachment; cached for the page's lifetime. */
export function attachmentUrl(messageId: string): Promise<string> {
  let p = blobCache.get(messageId);
  if (!p) {
    p = api
      .get(`/chat/messages/${messageId}/attachment`, { responseType: "blob" })
      .then(({ data }) => URL.createObjectURL(data as Blob));
    p.catch(() => blobCache.delete(messageId));
    blobCache.set(messageId, p);
  }
  return p;
}

export function useAttachmentUrl(messageId: string | null, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!messageId || !enabled) return;
    let alive = true;
    attachmentUrl(messageId)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [messageId, enabled]);
  return { url, error };
}

// ─── Images: shrink before upload (mobile data) ──────────────────────────────

/** Downscale a picked photo to ≤1600px JPEG in the browser. Falls back to the original. */
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

// ─── Voice recording ─────────────────────────────────────────────────────────

/** First audio type this browser can record (Chrome/Android: webm, iOS Safari: mp4). */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export type RecorderState = "idle" | "recording" | "denied" | "unsupported";

/**
 * Press-to-start / press-to-stop voice recorder. Stops itself at the
 * CHAT_MAX_VOICE_SEC limit. `stop(true)` discards the recording.
 */
export function useVoiceRecorder(onDone: (blob: Blob, seconds: number) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const discard = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
  };

  const stop = useCallback((cancel = false) => {
    discard.current = cancel;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("denied");
      return;
    }
    const mimeType = pickRecorderMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    discard.current = false;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const secs = Math.round((Date.now() - startedAt.current) / 1000);
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || "audio/webm" });
      cleanup();
      setState("idle");
      setSeconds(0);
      if (!discard.current && secs >= 1 && blob.size > 0) onDoneRef.current(blob, Math.min(secs, CHAT_MAX_VOICE_SEC));
    };
    recRef.current = rec;
    startedAt.current = Date.now();
    rec.start(250);
    setState("recording");
    setSeconds(0);
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= CHAT_MAX_VOICE_SEC) stop();
    }, 250);
  }, [stop]);

  useEffect(() => () => {
    discard.current = true;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    cleanup();
  }, []);

  return { state, seconds, start, stop, reset: () => setState("idle") };
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "14:05" (today) or "16 Nov 14:05", always Cairo time. */
export function chatTime(iso: string, localeId: string): string {
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const day = d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  return d.toLocaleString(localeId, {
    timeZone: "Africa/Cairo",
    ...(day === today ? {} : { day: "2-digit", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}
