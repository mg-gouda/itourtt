"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  Mic,
  RotateCw,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import api, { backgroundPoll } from "@/lib/api";
import { useLocaleId, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CHAT_MAX_FILE_BYTES,
  CHAT_THREAD_POLL_MS,
  chatTime,
  fmtDuration,
  shrinkImage,
  useAttachmentUrl,
  useVoiceRecorder,
  type ChatMessage,
  type ChatPerson,
} from "@/lib/chat";

interface ThreadHeader {
  id: string;
  other: ChatPerson;
  otherLastReadAt: string | null;
}

interface ChatThreadProps {
  conversationId: string;
  onBack?: () => void;
  /** Called after the thread is marked read, so badges can refresh. */
  onRead?: () => void;
  className?: string;
}

const errMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** One conversation: history, live polling, read receipts and the composer. */
export function ChatThread({ conversationId, onBack, onRead, className }: ChatThreadProps) {
  const t = useT();
  const localeId = useLocaleId();
  const [header, setHeader] = useState<ThreadHeader | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastServerAt = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    api
      .post(`/chat/conversations/${conversationId}/read`, null, backgroundPoll)
      .then(() => onReadRef.current?.())
      .catch(() => {});
  }, [conversationId]);

  // Initial load.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    setBlocked(null);
    lastServerAt.current = null;
    stickToBottom.current = true;
    Promise.all([
      api.get(`/chat/conversations/${conversationId}`),
      api.get(`/chat/conversations/${conversationId}/messages`, { params: { limit: 40 } }),
    ])
      .then(([h, m]) => {
        if (!alive) return;
        setHeader(h.data.data);
        const list: ChatMessage[] = m.data.data.messages;
        setMessages(list);
        setHasMore(m.data.data.hasMore);
        lastServerAt.current = list.at(-1)?.createdAt ?? null;
        if (!h.data.data.other.active) setBlocked(t("chat.unavailable"));
        markRead();
      })
      .catch(() => alive && setBlocked(t("chat.loadFailed")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [conversationId, markRead, t]);

  // Live polling for new messages + the other side's read position.
  useEffect(() => {
    if (loading) return;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await api.get(`/chat/conversations/${conversationId}/messages`, {
          ...backgroundPoll,
          params: lastServerAt.current ? { after: lastServerAt.current } : { limit: 40 },
        });
        const incoming: ChatMessage[] = data.data.messages;
        setHeader((h) => (h ? { ...h, otherLastReadAt: data.data.otherLastReadAt } : h));
        if (incoming.length) {
          lastServerAt.current = incoming.at(-1)!.createdAt;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
          });
          if (incoming.some((m) => !m.fromMe)) markRead();
        }
      } catch {
        /* next tick */
      }
    };
    const id = setInterval(poll, CHAT_THREAD_POLL_MS);
    const onVis = () => document.visibilityState === "visible" && (poll(), markRead());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [conversationId, loading, markRead]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    const first = messages.find((m) => !m.pending);
    if (!first) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const { data } = await api.get(`/chat/conversations/${conversationId}/messages`, {
        params: { before: first.createdAt, limit: 40 },
      });
      stickToBottom.current = false;
      setMessages((prev) => [...data.data.messages, ...prev]);
      setHasMore(data.data.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  // ─── Sending (optimistic, with retry) ───

  /** Form data of failed sends, so Retry can resend the exact same thing. */
  const retryForms = useRef(new Map<string, FormData>());

  const send = useCallback(
    async (msg: ChatMessage, form: FormData) => {
      stickToBottom.current = true;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev.map((m) => (m.id === msg.id ? { ...msg, pending: true, failed: false } : m))
          : [...prev, { ...msg, pending: true }],
      );
      try {
        const { data } = await api.post(`/chat/conversations/${conversationId}/messages`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const saved: ChatMessage = { ...data.data, localUrl: msg.localUrl };
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== msg.id && m.id !== saved.id);
          return [...without, saved].sort((a, b) =>
            a.pending === b.pending ? a.createdAt.localeCompare(b.createdAt) : a.pending ? 1 : -1,
          );
        });
        if (!lastServerAt.current || saved.createdAt > lastServerAt.current) {
          lastServerAt.current = saved.createdAt;
        }
        setBlocked(null);
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 403) setBlocked(errMessage(e, t("chat.unavailable")));
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, pending: false, failed: true } : m)),
        );
        retryForms.current.set(msg.id, form);
      }
    },
    [conversationId, t],
  );

  const localMessage = (kind: ChatMessage["kind"], extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: `local-${crypto.randomUUID()}`,
    fromMe: true,
    kind,
    body: null,
    hasAttachment: kind !== "TEXT",
    attachmentMime: null,
    attachmentSize: null,
    durationSec: null,
    createdAt: new Date().toISOString(),
    ...extra,
  });

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    const form = new FormData();
    form.append("kind", "TEXT");
    form.append("body", body);
    setText("");
    send(localMessage("TEXT", { body }), form);
  };

  const sendImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const blob = await shrinkImage(file);
    if (blob.size > CHAT_MAX_FILE_BYTES) {
      setBlocked(t("chat.tooLarge"));
      return;
    }
    const form = new FormData();
    form.append("kind", "IMAGE");
    form.append("file", blob, "photo.jpg");
    const caption = text.trim();
    if (caption) form.append("body", caption);
    setText("");
    send(localMessage("IMAGE", { body: caption || null, localUrl: URL.createObjectURL(blob) }), form);
  };

  const recorder = useVoiceRecorder((blob, secs) => {
    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("kind", "VOICE");
    form.append("durationSec", String(secs));
    form.append("file", blob, `voice.${ext}`);
    send(localMessage("VOICE", { durationSec: secs, localUrl: URL.createObjectURL(blob) }), form);
  });

  const retry = (m: ChatMessage) => {
    const form = retryForms.current.get(m.id);
    if (form) send(m, form);
  };
  const discardFailed = (m: ChatMessage) => {
    retryForms.current.delete(m.id);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  };

  const other = header?.other;
  const seenUpTo = header?.otherLastReadAt ?? null;
  const recording = recorder.state === "recording";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label={t("chat.back")}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{other?.name ?? "…"}</span>
            {other?.online && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" aria-label={t("chat.online")} />}
          </div>
          {other && <div className="truncate text-[11px] text-muted-foreground">{other.roleName}</div>}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/30 px-3 py-3"
        aria-live="polite"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("chat.loadEarlier")}
                </Button>
              </div>
            )}
            {messages.length === 0 && (
              <p className="py-10 text-center text-xs text-muted-foreground">{t("chat.emptyThread")}</p>
            )}
            {messages.map((m) => (
              <Bubble
                key={m.id}
                m={m}
                localeId={localeId}
                seen={!!(m.fromMe && !m.pending && seenUpTo && seenUpTo >= m.createdAt)}
                onRetry={() => retry(m)}
                onDiscard={() => discardFailed(m)}
              />
            ))}
          </>
        )}
      </div>

      {blocked && (
        <div className="flex shrink-0 items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{blocked}</span>
        </div>
      )}
      {(recorder.state === "denied" || recorder.state === "unsupported") && (
        <div className="flex shrink-0 items-start gap-2 border-t border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t(recorder.state === "denied" ? "chat.micDenied" : "chat.micUnsupported")}</span>
          <button type="button" className="underline" onClick={recorder.reset}>
            {t("chat.dismiss")}
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="flex shrink-0 items-end gap-1.5 border-t border-border bg-card p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) sendImage(f);
          }}
        />
        {recording ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 text-destructive"
              onClick={() => recorder.stop(true)}
              aria-label={t("chat.cancelRecording")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex h-10 flex-1 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 text-sm">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              <span className="tabular-nums">{fmtDuration(recorder.seconds)}</span>
              <span className="truncate text-xs text-muted-foreground">{t("chat.recording")}</span>
            </div>
            <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => recorder.stop()} aria-label={t("chat.sendVoice")}>
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              aria-label={t("chat.attachImage")}
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendText();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={t("chat.placeholder")}
              disabled={loading}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              dir="auto"
            />
            {text.trim() ? (
              <Button size="icon" className="h-10 w-10 shrink-0" onClick={sendText} aria-label={t("chat.send")}>
                <Send className="h-4 w-4 rtl:rotate-180" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={recorder.start}
                disabled={loading}
                aria-label={t("chat.recordVoice")}
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Bubble({
  m,
  localeId,
  seen,
  onRetry,
  onDiscard,
}: {
  m: ChatMessage;
  localeId: string;
  seen: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  const remote = useAttachmentUrl(m.id, m.hasAttachment && !m.localUrl && !m.pending && !m.failed);
  const src = m.localUrl ?? remote.url;

  return (
    <div className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
          m.fromMe ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card text-foreground",
          m.pending && "opacity-70",
          m.failed && "ring-2 ring-destructive",
        )}
      >
        {m.kind === "IMAGE" &&
          (src ? (
            <a href={src} target="_blank" rel="noopener noreferrer" className="-mx-1.5 -mt-0.5 mb-1 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={t("chat.photo")} className="max-h-64 w-full rounded-xl object-cover" />
            </a>
          ) : (
            <div className="mb-1 flex h-32 w-48 items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
              {remote.error ? t("chat.attachmentFailed") : <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          ))}
        {m.kind === "VOICE" &&
          (src ? (
            <audio controls preload="metadata" src={src} className="h-10 w-60 max-w-full" />
          ) : (
            <div className="flex h-10 w-56 items-center gap-2 text-xs opacity-80">
              {remote.error ? t("chat.attachmentFailed") : <Loader2 className="h-4 w-4 animate-spin" />}
              {m.durationSec ? fmtDuration(m.durationSec) : null}
            </div>
          ))}
        {m.body && <p className="whitespace-pre-wrap break-words" dir="auto">{m.body}</p>}
        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            m.fromMe ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {m.kind === "VOICE" && m.durationSec ? <span>{fmtDuration(m.durationSec)} ·</span> : null}
          <span>{chatTime(m.createdAt, localeId)}</span>
          {m.fromMe &&
            (m.pending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-label={t("chat.sending")} />
            ) : m.failed ? null : seen ? (
              <CheckCheck className="h-3.5 w-3.5" aria-label={t("chat.seen")} />
            ) : (
              <Check className="h-3.5 w-3.5" aria-label={t("chat.sent")} />
            ))}
        </div>
        {m.failed && (
          <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
            <span>{t("chat.notSent")}</span>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-0.5 underline">
              <RotateCw className="h-3 w-3" />
              {t("chat.retry")}
            </button>
            <button type="button" onClick={onDiscard} className="underline">
              {t("chat.discard")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
