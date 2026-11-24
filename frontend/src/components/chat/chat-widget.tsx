"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENTS_ID, useChatMe, type ChatMe } from "@/lib/chat";
import { ChatInbox } from "./chat-inbox";
import { ChatThread } from "./chat-thread";
import { AnnouncementsThread } from "./announcements-thread";
import { BroadcastPanel } from "./broadcast-panel";

/** Widget-only view id for the broadcast console (never a conversation id). */
const BROADCAST_VIEW = "__broadcast";

/** Short two-note chime via WebAudio (no asset). Silently skipped if the browser blocks audio. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.start(t0);
      o.stop(t0 + 0.24);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* no audio */
  }
}

/**
 * Staff chat: a floating button bottom-right on every dashboard page. Shown to
 * staff whose role is in a chat contact list (or who have chat history). It
 * opens by itself on a newly received message — unless the user is already
 * reading another thread, in which case only the badge updates.
 */
export function ChatWidget() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastSeenUnreadAt = useRef<string | null | undefined>(undefined);
  const stateRef = useRef({ open, thread });
  useEffect(() => {
    stateRef.current = { open, thread };
  }, [open, thread]);

  // Pop open on a newly arrived message (runs on each poll result).
  const onUpdate = useCallback((next: ChatMe) => {
    const latest = next.latestUnread ?? null;
    const prev = lastSeenUnreadAt.current;
    lastSeenUnreadAt.current = latest?.at ?? prev ?? null;
    if (prev === undefined || !latest) return; // first poll: badge only
    if (prev && latest.at <= prev) return;
    chime();
    const { open: isOpen, thread: current } = stateRef.current;
    if (!isOpen || !current) {
      setOpen(true);
      setThread(latest.conversationId);
    } else if (current !== latest.conversationId) {
      setRefreshKey((k) => k + 1);
    }
  }, []);
  const { me } = useChatMe(true, onUpdate);

  // A browser notification click lands on /dashboard?chat=<id>: open that chat, then tidy the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("chat");
    if (!id) return;
    setOpen(true);
    setThread(id);
    url.searchParams.delete("chat");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  if (!me?.enabled) return null;
  const unread = me.unreadTotal ?? 0;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t("chat.title")}
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
            "inset-x-2 bottom-[8.5rem] top-16 rounded-xl sm:inset-auto sm:bottom-[8.5rem] sm:right-5 sm:h-[min(600px,calc(100vh-11rem))] sm:w-[380px]",
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-primary px-3 py-2 text-primary-foreground">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="h-4 w-4" />
              {t("chat.title")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={() => setOpen(false)}
              aria-label={t("chat.close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {thread === BROADCAST_VIEW ? (
              <BroadcastPanel onBack={() => setThread(null)} />
            ) : thread === ANNOUNCEMENTS_ID ? (
              <AnnouncementsThread
                onBack={() => {
                  setThread(null);
                  setRefreshKey((k) => k + 1);
                }}
              />
            ) : thread ? (
              <ChatThread
                key={thread}
                conversationId={thread}
                onBack={() => {
                  setThread(null);
                  setRefreshKey((k) => k + 1);
                }}
              />
            ) : (
              <ChatInbox
                canStartWith={me.canStartWith ?? []}
                onOpen={setThread}
                onBroadcast={me.canBroadcast ? () => setThread(BROADCAST_VIEW) : undefined}
                refreshKey={refreshKey}
              />
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `${t("chat.title")} (${unread})` : t("chat.title")}
        className="fixed bottom-[4.5rem] right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {unread > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
