"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Car, Loader2, Megaphone, Send, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import api, { backgroundPoll } from "@/lib/api";
import { useLocaleId, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_LABEL_KEY,
  CHAT_ME_POLL_MS,
  broadcastAttachmentPath,
  chatTime,
  type ChatBroadcastAudience,
  type ChatKind,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatSentBroadcast,
} from "@/lib/chat";
import { ChatBubble, StatusTicks } from "./chat-message";
import { ChatComposer } from "./chat-composer";

const AUDIENCE_ICON: Record<ChatBroadcastAudience, typeof Users> = {
  REPS: UserCheck,
  DRIVERS: Car,
  REPS_AND_DRIVERS: Users,
  STAFF: Users,
};

interface Recipient {
  userId: string;
  name: string;
  roleName: string;
  status: ChatMessageStatus;
  deliveredAt: string | null;
  readAt: string | null;
}

const errMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/**
 * Broadcast console (perm chat-broadcast): pick an audience, compose any
 * message kind, confirm, send. Shows every broadcast sent with live
 * delivered / seen counts, and per-person receipts on click.
 */
export function BroadcastPanel({ onBack, className }: { onBack?: () => void; className?: string }) {
  const t = useT();
  const localeId = useLocaleId();
  const [audiences, setAudiences] = useState<{ audience: ChatBroadcastAudience; recipients: number }[]>([]);
  const [audience, setAudience] = useState<ChatBroadcastAudience>("REPS_AND_DRIVERS");
  const [sent, setSent] = useState<ChatSentBroadcast[] | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ChatKind; form: FormData; preview: Partial<ChatMessage> } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ChatSentBroadcast | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSent = useCallback(async (background = false) => {
    try {
      const { data } = await api.get("/chat/broadcasts", { ...(background ? backgroundPoll : {}), params: { limit: 30 } });
      setSent([...data.data.broadcasts].reverse());
    } catch {
      setSent((s) => s ?? []);
    }
  }, []);

  useEffect(() => {
    api
      .get("/chat/broadcasts/audiences")
      .then(({ data }) => setAudiences(data.data))
      .catch(() => {});
    loadSent();
    // Receipt counts move as people open their portals — keep them live.
    const id = setInterval(() => document.visibilityState === "visible" && loadSent(true), CHAT_ME_POLL_MS);
    return () => clearInterval(id);
  }, [loadSent]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sent?.length]);

  const count = audiences.find((a) => a.audience === audience)?.recipients;

  const doSend = async () => {
    if (!confirm) return;
    setSending(true);
    setError(null);
    const form = confirm.form;
    form.set("audience", audience);
    try {
      const { data } = await api.post("/chat/broadcasts", form, { headers: { "Content-Type": "multipart/form-data" } });
      setSent((s) => [...(s ?? []), { ...data.data, localUrl: confirm.preview.localUrl }]);
      setConfirm(null);
    } catch (e) {
      setError(errMessage(e, t("chat.broadcastFailed")));
    } finally {
      setSending(false);
    }
  };

  if (receipts) {
    return <ReceiptsView broadcast={receipts} onBack={() => setReceipts(null)} className={className} />;
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label={t("chat.back")}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
        )}
        <Megaphone className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{t("chat.broadcast")}</div>
          <div className="truncate text-[11px] text-muted-foreground">{t("chat.broadcastHint")}</div>
        </div>
      </div>

      {/* Audience */}
      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-2" role="radiogroup" aria-label={t("chat.audience")}>
        {(["REPS", "DRIVERS", "REPS_AND_DRIVERS", "STAFF"] as ChatBroadcastAudience[]).map((a) => {
          const Icon = AUDIENCE_ICON[a];
          const n = audiences.find((x) => x.audience === a)?.recipients;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={audience === a}
              onClick={() => setAudience(a)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-start text-xs transition-colors",
                audience === a ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(AUDIENCE_LABEL_KEY[a])}</span>
              {n !== undefined && <span className="shrink-0 tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* History */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/30 px-3 py-3">
        {sent === null ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sent.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">{t("chat.noBroadcasts")}</p>
        ) : (
          sent.map((b) => {
            const status: ChatMessageStatus =
              b.recipientCount > 0 && b.seenCount >= b.recipientCount
                ? "SEEN"
                : b.recipientCount > 0 && b.deliveredCount >= b.recipientCount
                  ? "DELIVERED"
                  : "SENT";
            return (
              <ChatBubble
                key={b.id}
                m={{ ...b, fromMe: true }}
                localeId={localeId}
                status={status}
                attachmentPath={broadcastAttachmentPath(b.id)}
                heading={
                  <>
                    {t(AUDIENCE_LABEL_KEY[b.audience])}
                    <span className="font-normal opacity-80"> · {b.senderName}</span>
                  </>
                }
                footer={
                  <button
                    type="button"
                    onClick={() => setReceipts(b)}
                    className="mt-1 flex w-full items-center justify-end gap-2 border-t border-primary-foreground/20 pt-1 text-[11px] text-primary-foreground/90 underline-offset-2 hover:underline"
                  >
                    <span>
                      {t("chat.deliveredCount")} {b.deliveredCount}/{b.recipientCount}
                    </span>
                    <span>
                      {t("chat.seenCount")} {b.seenCount}/{b.recipientCount}
                    </span>
                  </button>
                }
              />
            );
          })
        )}
      </div>

      {error && (
        <div className="flex shrink-0 items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {confirm ? (
        <div className="shrink-0 border-t border-border bg-amber-500/10 p-2">
          <p className="mb-2 text-xs">
            {t("chat.broadcastConfirm")}{" "}
            <strong>
              {t(AUDIENCE_LABEL_KEY[audience])}
              {count !== undefined ? ` (${count})` : ""}
            </strong>
            {confirm.preview.body ? (
              <span className="mt-1 block truncate text-muted-foreground" dir="auto">
                “{confirm.preview.body}”
              </span>
            ) : (
              <span className="mt-1 block text-muted-foreground">
                {t(
                  confirm.kind === "IMAGE"
                    ? "chat.photo"
                    : confirm.kind === "VOICE"
                      ? "chat.voiceNote"
                      : confirm.kind === "LOCATION"
                        ? "chat.location"
                        : "chat.message",
                )}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              onClick={() => {
                setConfirm(null);
                setError(null);
              }}
              disabled={sending}
            >
              <X className="h-3.5 w-3.5" />
              {t("chat.cancel")}
            </Button>
            <Button size="sm" className="flex-1 gap-1" onClick={doSend} disabled={sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 rtl:rotate-180" />}
              {t("chat.broadcastSend")}
            </Button>
          </div>
        </div>
      ) : (
        <ChatComposer
          placeholder={t("chat.broadcastPlaceholder")}
          onSend={(kind, form, preview) => {
            setError(null);
            setConfirm({ kind, form, preview });
          }}
        />
      )}
    </div>
  );
}

function ReceiptsView({
  broadcast,
  onBack,
  className,
}: {
  broadcast: ChatSentBroadcast;
  onBack: () => void;
  className?: string;
}) {
  const t = useT();
  const localeId = useLocaleId();
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [filter, setFilter] = useState<ChatMessageStatus | "ALL">("ALL");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get(`/chat/broadcasts/${broadcast.id}/recipients`, backgroundPoll)
        .then(({ data }) => alive && setRows(data.data))
        .catch(() => alive && setRows((r) => r ?? []));
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), CHAT_ME_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [broadcast.id]);

  const counts = { SEEN: 0, DELIVERED: 0, SENT: 0 };
  rows?.forEach((r) => counts[r.status]++);
  const shown = (rows ?? []).filter((r) => filter === "ALL" || r.status === filter);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label={t("chat.back")}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{t("chat.receipts")}</div>
          <div className="truncate text-[11px] text-muted-foreground" dir="auto">
            {t(AUDIENCE_LABEL_KEY[broadcast.audience])} · {chatTime(broadcast.createdAt, localeId)}
            {broadcast.body ? ` · ${broadcast.body}` : ""}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1 border-b border-border p-2">
        {(["ALL", "SEEN", "DELIVERED", "SENT"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="h-7 flex-1 px-1 text-[11px]"
            onClick={() => setFilter(f)}
          >
            {t(f === "ALL" ? "chat.all" : f === "SEEN" ? "chat.seen" : f === "DELIVERED" ? "chat.delivered" : "chat.notDelivered")}
            <span className="ms-1 tabular-nums opacity-70">{f === "ALL" ? (rows?.length ?? "") : counts[f]}</span>
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("chat.noMatches")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.roleName}</span>
                </span>
                <span className="shrink-0 text-end text-[10px] text-muted-foreground">
                  {r.readAt
                    ? `${t("chat.seen")} ${chatTime(r.readAt, localeId)}`
                    : r.deliveredAt
                      ? `${t("chat.delivered")} ${chatTime(r.deliveredAt, localeId)}`
                      : t("chat.notDelivered")}
                </span>
                <StatusTicks status={r.status} className="text-muted-foreground" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
