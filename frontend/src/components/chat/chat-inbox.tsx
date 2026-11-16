"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Car, Image as ImageIcon, Loader2, Mic, Plus, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api, { backgroundPoll } from "@/lib/api";
import { useLocaleId, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CHAT_ME_POLL_MS, CHAT_READ_EVENT, chatTime, type ChatConversationSummary, type ChatPerson } from "@/lib/chat";

interface ChatInboxProps {
  /** Portal users always see "new chat"; staff only when they may start one. */
  canStartWith: ("REP" | "DRIVER")[] | "STAFF";
  onOpen: (conversationId: string) => void;
  /** Bump to force a reload (e.g. after a thread was read). */
  refreshKey?: number;
  className?: string;
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Conversation list + "new chat" picker. Portal users pick from the staff in
 * their contact list; staff pick drivers / reps.
 */
export function ChatInbox({ canStartWith, onOpen, refreshKey, className }: ChatInboxProps) {
  const t = useT();
  const localeId = useLocaleId();
  const [convs, setConvs] = useState<ChatConversationSummary[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/conversations", backgroundPoll);
      setConvs(data.data);
    } catch {
      setConvs((c) => c ?? []);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => document.visibilityState === "visible" && load(), CHAT_ME_POLL_MS);
    window.addEventListener(CHAT_READ_EVENT, load);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener(CHAT_READ_EVENT, load);
    };
  }, [load, refreshKey]);

  const canStart = canStartWith === "STAFF" || canStartWith.length > 0;
  const shown = useMemo(() => {
    const q = norm(filter.trim());
    return (convs ?? []).filter((c) => !q || norm(c.other.name).includes(q));
  }, [convs, filter]);

  if (picking) {
    return (
      <ContactPicker
        staffRoles={canStartWith === "STAFF" ? null : canStartWith}
        onBack={() => setPicking(false)}
        onPick={async (p) => {
          const { data } = await api.post("/chat/conversations", { userId: p.userId });
          setPicking(false);
          onOpen(data.data.id);
        }}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("chat.searchChats")}
            className="h-9 pl-8 text-sm"
          />
        </div>
        {canStart && (
          <Button size="sm" className="h-9 gap-1" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" />
            {t("chat.newChat")}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {convs === null ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <p>{filter ? t("chat.noMatches") : t("chat.noChats")}</p>
            {!filter && canStart && (
              <Button variant="link" size="sm" onClick={() => setPicking(true)}>
                {t("chat.startFirst")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/60"
                >
                  <Avatar person={c.other} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>
                        {c.other.name}
                      </span>
                      {c.lastMessage && (
                        <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">
                          {chatTime(c.lastMessage.createdAt, localeId)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-1 truncate text-xs",
                          c.unread ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {c.lastMessage ? (
                          <>
                            {c.lastMessage.fromMe && <span className="shrink-0">{t("chat.you")}:</span>}
                            {c.lastMessage.kind === "IMAGE" && <ImageIcon className="h-3 w-3 shrink-0" />}
                            {c.lastMessage.kind === "VOICE" && <Mic className="h-3 w-3 shrink-0" />}
                            <span className="truncate">
                              {c.lastMessage.body ||
                                (c.lastMessage.kind === "IMAGE"
                                  ? t("chat.photo")
                                  : c.lastMessage.kind === "VOICE"
                                    ? t("chat.voiceNote")
                                    : "")}
                            </span>
                          </>
                        ) : (
                          <span className="italic">{c.other.roleName}</span>
                        )}
                      </span>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Avatar({ person }: { person: ChatPerson }) {
  const initials = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const Icon = person.role === "DRIVER" ? Car : person.role === "REP" ? UserCheck : null;
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {Icon ? <Icon className="h-4 w-4" /> : initials || "?"}
      {person.online && (
        <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
      )}
    </span>
  );
}

function ContactPicker({
  staffRoles,
  onBack,
  onPick,
  className,
}: {
  /** null = portal user picking staff; otherwise the portal roles staff may reach. */
  staffRoles: ("REP" | "DRIVER")[] | null;
  onBack: () => void;
  onPick: (p: ChatPerson) => Promise<void>;
  className?: string;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"REP" | "DRIVER" | undefined>(staffRoles?.[0]);
  const [people, setPeople] = useState<ChatPerson[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const { data } = await api.get("/chat/contacts", {
          params: { search: search.trim() || undefined, role },
        });
        if (alive) setPeople(data.data);
      } catch {
        if (alive) setPeople([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [search, role]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack} aria-label={t("chat.back")}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat.searchPeople")}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>
      {staffRoles && staffRoles.length > 1 && (
        <div className="flex shrink-0 gap-1 border-b border-border p-2">
          {staffRoles.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={role === r ? "default" : "outline"}
              className="h-7 flex-1 text-xs"
              onClick={() => setRole(r)}
            >
              {t(r === "DRIVER" ? "chat.drivers" : "chat.reps")}
            </Button>
          ))}
        </div>
      )}
      <p className="shrink-0 px-3 pt-2 text-[11px] text-muted-foreground">
        {staffRoles ? t("chat.pickPortalHint") : t("chat.pickStaffHint")}
      </p>
      {error && <p className="px-3 pt-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {people === null ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : people.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("chat.noContacts")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.userId}>
                <button
                  type="button"
                  disabled={!!opening}
                  onClick={async () => {
                    setOpening(p.userId);
                    setError(null);
                    try {
                      await onPick(p);
                    } catch (e) {
                      setError(
                        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                          t("chat.openFailed"),
                      );
                    } finally {
                      setOpening(null);
                    }
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/60 disabled:opacity-60"
                >
                  <Avatar person={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.roleName}
                      {p.online ? ` · ${t("chat.online")}` : ""}
                    </span>
                  </span>
                  {opening === p.userId && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
