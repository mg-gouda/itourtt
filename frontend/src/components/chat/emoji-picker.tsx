"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Chat emojis (6.7.0): a small built-in picker — no extra library, works offline on the
 * portals. The last 16 picked are kept per browser under "Recent".
 */
const GROUPS: { key: string; icon: string; emojis: string[] }[] = [
  {
    key: "smileys",
    icon: "😀",
    emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕".split(" "),
  },
  {
    key: "gestures",
    icon: "👍",
    emojis: "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 💪 ✍️ 👀 🫡 🙋 🙆 🙅 🤷 🤦 🙇".split(" "),
  },
  {
    key: "travel",
    icon: "✈️",
    emojis: "✈️ 🛬 🛫 🚐 🚌 🚕 🚗 🚙 🛻 🚦 🚧 ⛽ 🗺️ 📍 🧭 🏨 🏖️ 🏝️ 🏜️ 🏛️ 🕌 ⛱️ 🌊 🐪 🤿 🚤 ⛵ 🧳 🎒 🛂 🛃 🎫 ⏰ ⏱️ 🕐 📅".split(" "),
  },
  {
    key: "symbols",
    icon: "✅",
    emojis: "✅ ☑️ ✔️ ❌ ❎ ⚠️ 🚫 ⛔ ❗ ❓ ‼️ ⁉️ 💯 🔥 ⭐ 🌟 ✨ 💥 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 🎉 🎊 🎁 🏆 📞 📱 💬 📝 📌 📎 🔔 🔕 💰 💵 💳".split(" "),
  },
];
const RECENT_KEY = "chat-emoji-recent";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState("recent");

  const groups = [{ key: "recent", icon: "🕘", emojis: recent }, ...GROUPS].filter((g) => g.key !== "recent" || g.emojis.length);
  const current = groups.find((g) => g.key === tab) ?? groups[0];

  const pick = (e: string) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 16);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          const r = readRecent();
          setRecent(r);
          setTab(r.length ? "recent" : "smileys");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-9 shrink-0"
          disabled={disabled}
          aria-label={t("chat.emoji")}
          title={t("chat.emoji")}
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      {/* Above the office chat window (z-60) and portal bars. */}
      <PopoverContent side="top" align="start" className="z-[100] w-[min(20rem,calc(100vw-1rem))] p-0">
        <div role="tablist" aria-label={t("chat.emoji")} className="flex border-b border-border">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={current?.key === g.key}
              aria-label={t(`chat.emojiGroup.${g.key}`)}
              onClick={() => setTab(g.key)}
              className={cn(
                "flex h-10 flex-1 items-center justify-center text-lg",
                current?.key === g.key ? "border-b-2 border-primary bg-muted/50" : "opacity-70 hover:opacity-100",
              )}
            >
              {g.icon}
            </button>
          ))}
        </div>
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
          {current?.emojis.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(e)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-muted active:scale-95"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
