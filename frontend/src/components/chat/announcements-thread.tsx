"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import api, { backgroundPoll } from "@/lib/api";
import { useLocaleId, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENTS_ID,
  AUDIENCE_LABEL_KEY,
  CHAT_THREAD_POLL_MS,
  announceChatRead,
  broadcastAttachmentPath,
  type ChatAnnouncement,
} from "@/lib/chat";
import { ChatBubble } from "./chat-message";

/**
 * Read-only thread of the broadcasts the caller received. Opening it marks
 * them all seen (which the sender sees in the broadcast's receipt counts).
 */
export function AnnouncementsThread({ onBack, className }: { onBack?: () => void; className?: string }) {
  const t = useT();
  const localeId = useLocaleId();
  const [items, setItems] = useState<ChatAnnouncement[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const itemsRef = useRef<ChatAnnouncement[] | null>(null);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    api
      .post("/chat/announcements/read", null, backgroundPoll)
      .then(() => announceChatRead(ANNOUNCEMENTS_ID))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (background: boolean) => {
      try {
        const { data } = await api.get("/chat/announcements", {
          ...(background ? backgroundPoll : {}),
          params: { limit: 40 },
        });
        const page: ChatAnnouncement[] = data.data.announcements;
        const prev = itemsRef.current;
        let fresh: boolean;
        if (!prev) {
          setHasMore(data.data.hasMore);
          fresh = page.some((a) => !a.read);
          itemsRef.current = page;
        } else {
          const known = new Set(prev.map((a) => a.id));
          const added = page.filter((a) => !known.has(a.id));
          fresh = added.length > 0;
          if (fresh) itemsRef.current = [...prev, ...added];
        }
        setItems(itemsRef.current);
        if (fresh || !background) markRead();
      } catch {
        itemsRef.current ??= [];
        setItems(itemsRef.current);
      }
    },
    [markRead],
  );

  useEffect(() => {
    load(false);
    const id = setInterval(() => document.visibilityState === "visible" && load(true), CHAT_THREAD_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const loadOlder = async () => {
    const first = items?.[0];
    if (!first) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const { data } = await api.get("/chat/announcements", { params: { before: first.createdAt, limit: 40 } });
      stick.current = false;
      itemsRef.current = [...data.data.announcements, ...(itemsRef.current ?? [])];
      setItems(itemsRef.current);
      setHasMore(data.data.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

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
          <div className="truncate text-sm font-semibold">{t("chat.announcements")}</div>
          <div className="truncate text-[11px] text-muted-foreground">{t("chat.announcementsHint")}</div>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/30 px-3 py-3"
        aria-live="polite"
      >
        {items === null ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">{t("chat.noAnnouncements")}</p>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("chat.loadEarlier")}
                </Button>
              </div>
            )}
            {items.map((a) => (
              <ChatBubble
                key={a.id}
                m={{ ...a, fromMe: false }}
                localeId={localeId}
                status={null}
                attachmentPath={broadcastAttachmentPath(a.id)}
                heading={
                  <>
                    {a.senderName}
                    <span className="font-normal text-muted-foreground"> · {t(AUDIENCE_LABEL_KEY[a.audience])}</span>
                  </>
                }
              />
            ))}
          </>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-card px-3 py-2 text-center text-[11px] text-muted-foreground">
        {t("chat.announcementsReadOnly")}
      </div>
    </div>
  );
}
