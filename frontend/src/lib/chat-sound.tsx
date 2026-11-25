"use client";

import { useEffect, useRef } from "react";

/**
 * Chat message sound (6.6.0) — a soft two-note "pop", made in-house
 * (public/sounds/chat-message.wav; the apps use res/raw/chat_message.wav).
 * Plays once when the person's unread chat count goes up. It never plays over
 * a ringing job alarm, and at most once every 2 seconds so a burst of messages
 * is one sound. Browsers allow sound only after the first click on the page;
 * the alarm-sound gate's first-click unlock covers this player too.
 */
const SRC = "/sounds/chat-message.wav";
let audio: HTMLAudioElement | null = null;
let lastAt = 0;

export function playChatSound() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastAt < 2000) return;
  lastAt = now;
  if (!audio) {
    audio = new Audio(SRC);
    audio.preload = "auto";
    audio.volume = 0.8;
  }
  audio.currentTime = 0;
  audio.play().catch(() => { /* not yet allowed — the next message after a click will sound */ });
}

/** Mount once in a signed-in layout with the live unread total. */
export function ChatSoundWatcher({ unread }: { unread: number }) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current !== null && unread > last.current) playChatSound();
    last.current = unread;
  }, [unread]);
  // Prime the player on the first interaction so the first message can sound.
  useEffect(() => {
    const prime = () => {
      if (!audio) { audio = new Audio(SRC); audio.preload = "auto"; audio.volume = 0.8; }
      const a = audio;
      a.muted = true;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
      window.removeEventListener("pointerdown", prime);
    };
    window.addEventListener("pointerdown", prime);
    return () => window.removeEventListener("pointerdown", prime);
  }, []);
  return null;
}
