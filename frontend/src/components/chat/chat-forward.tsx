"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Forward, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ChatConversationSummary, ChatMessage, ChatPerson } from "@/lib/chat";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const errMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/**
 * Forward a message (photo, voice note, location or text) to other chats (6.2.0).
 * Drawn over the thread inside the chat panel — never a page-blocking dialog — so the
 * chat keeps working on top of the notification popups. Recent chats first, then anyone
 * the caller may start a chat with (office staff included for the roles that reach them).
 */
export function ForwardPanel({
  message,
  currentConversationId,
  onClose,
  onDone,
}: {
  message: ChatMessage;
  currentConversationId: string;
  onClose: () => void;
  onDone: (sent: number) => void;
}) {
  const t = useT();
  const [convs, setConvs] = useState<ChatConversationSummary[] | null>(null);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, { kind: "conv" | "user"; label: string }>>(new Map());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/chat/conversations").then(({ data }) => setConvs(data.data ?? [])).catch(() => setConvs([]));
  }, []);
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      api
        .get("/chat/contacts", { params: { search: search.trim() || undefined } })
        .then(({ data }) => alive && setPeople(data.data ?? []))
        .catch(() => alive && setPeople([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [search]);

  const q = norm(search.trim());
  const recent = useMemo(
    () => (convs ?? []).filter((c) => c.id !== currentConversationId && c.other.active && (!q || norm(c.other.name).includes(q))),
    [convs, currentConversationId, q],
  );
  // People without a chat yet (the ones with one are listed under recent chats).
  const withChat = useMemo(() => new Set((convs ?? []).map((c) => c.other.userId)), [convs]);
  const newPeople = people.filter((p) => !withChat.has(p.userId));

  const toggle = (key: string, kind: "conv" | "user", label: string) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 20) next.set(key, { kind, label });
      return next;
    });

  const send = async () => {
    setSending(true);
    setError(null);
    const conversationIds = [...picked].filter(([, v]) => v.kind === "conv").map(([k]) => k);
    const userIds = [...picked].filter(([, v]) => v.kind === "user").map(([k]) => k);
    try {
      const { data } = await api.post(`/chat/messages/${message.id}/forward`, { conversationIds, userIds });
      onDone(data.data?.sent ?? picked.size);
    } catch (e) {
      setError(errMessage(e, t("chat.forwardFailed")));
    } finally {
      setSending(false);
    }
  };

  const row = (key: string, kind: "conv" | "user", p: ChatPerson) => {
    const on = picked.has(key);
    return (
      <li key={`${kind}-${key}`}>
        <button
          type="button"
          onClick={() => toggle(key, kind, p.name)}
          className={cn("flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-muted/60", on && "bg-primary/10")}
        >
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {on && <Check className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {p.roleName}
              {p.online ? ` · ${t("chat.online")}` : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("chat.close")}>
          <X className="h-4 w-4" />
        </Button>
        <span className="flex-1 text-sm font-semibold">{t("chat.forwardTo")}</span>
      </div>
      <div className="shrink-0 border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("chat.searchPeople")} className="h-9 pl-8 text-sm" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {convs === null ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {recent.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("chat.recentChats")}</p>
                <ul className="divide-y divide-border">{recent.map((c) => row(c.id, "conv", c.other))}</ul>
              </>
            )}
            {newPeople.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("chat.people")}</p>
                <ul className="divide-y divide-border">{newPeople.map((p) => row(p.userId, "user", p))}</ul>
              </>
            )}
            {recent.length === 0 && newPeople.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("chat.noContacts")}</p>
            )}
          </>
        )}
      </div>
      {error && <p className="shrink-0 px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {picked.size ? [...picked.values()].map((v) => v.label).join(", ") : t("chat.forwardPick")}
        </span>
        <Button size="sm" className="gap-1.5" disabled={!picked.size || sending} onClick={send}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
          {t("chat.forward")}
        </Button>
      </div>
    </div>
  );
}
