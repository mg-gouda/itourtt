"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api, { backgroundPoll } from "@/lib/api";
import { useLocaleId, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CHAT_THREAD_POLL_MS,
  announceChatRead,
  messageAttachmentPath,
  type ChatKind,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatPerson,
} from "@/lib/chat";
import { ChatBubble } from "./chat-message";
import { ChatComposer } from "./chat-composer";
import { ForwardPanel } from "./chat-forward";

interface ThreadHeader {
  id: string;
  other: ChatPerson;
  otherLastReadAt: string | null;
  otherLastDeliveredAt: string | null;
}

/** Ticks for one of my messages from the other side's delivered / read positions. */
function statusFor(m: ChatMessage, header: ThreadHeader | null): ChatMessageStatus | null {
  if (!m.fromMe || m.pending || m.failed) return null;
  if (header?.otherLastReadAt && header.otherLastReadAt >= m.createdAt) return "SEEN";
  if (header?.otherLastDeliveredAt && header.otherLastDeliveredAt >= m.createdAt) return "DELIVERED";
  return "SENT";
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
  const [blocked, setBlocked] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastServerAt = useRef<string | null>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    api
      .post(`/chat/conversations/${conversationId}/read`, {}, backgroundPoll)
      .then(() => {
        announceChatRead(conversationId);
        onReadRef.current?.();
      })
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
        setHeader((h) =>
          h
            ? {
                ...h,
                otherLastReadAt: data.data.otherLastReadAt,
                otherLastDeliveredAt: data.data.otherLastDeliveredAt,
              }
            : h,
        );
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

  const onComposerSend = (kind: ChatKind, form: FormData, preview: Partial<ChatMessage>) => {
    send(
      {
        id: `local-${crypto.randomUUID()}`,
        fromMe: true,
        kind,
        body: null,
        hasAttachment: false,
        attachmentMime: null,
        attachmentSize: null,
        durationSec: null,
        createdAt: new Date().toISOString(),
        ...preview,
      },
      form,
    );
  };

  const retry = (m: ChatMessage) => {
    const form = retryForms.current.get(m.id);
    if (form) send(m, form);
  };
  const discardFailed = (m: ChatMessage) => {
    retryForms.current.delete(m.id);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  };

  const other = header?.other;

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      {forwarding && (
        <ForwardPanel
          message={forwarding}
          currentConversationId={conversationId}
          onClose={() => setForwarding(null)}
          onDone={(n) => {
            setForwarding(null);
            setNotice(t("chat.forwardSent").replace("{n}", String(n)));
            setTimeout(() => setNotice(null), 3000);
          }}
        />
      )}
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
              <ChatBubble
                key={m.id}
                m={m}
                localeId={localeId}
                status={statusFor(m, header)}
                attachmentPath={m.id.startsWith("local-") ? null : messageAttachmentPath(m.id)}
                onRetry={() => retry(m)}
                onDiscard={() => discardFailed(m)}
                onForward={m.id.startsWith("local-") || m.pending || m.failed ? undefined : () => setForwarding(m)}
              />
            ))}
          </>
        )}
      </div>

      {notice && (
        <div className="shrink-0 border-t border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">{notice}</div>
      )}
      {blocked && (
        <div className="flex shrink-0 items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{blocked}</span>
        </div>
      )}

      <ChatComposer disabled={loading} onSend={onComposerSend} />
    </div>
  );
}
