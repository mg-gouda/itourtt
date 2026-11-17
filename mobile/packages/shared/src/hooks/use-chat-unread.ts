import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { chatApi, type ChatMe } from '../api/endpoints/chat';

/** How often the chat badge checks for new messages. */
export const CHAT_POLL_MS = 15_000;
/** How often an open chat thread checks for new messages. */
export const CHAT_THREAD_POLL_MS = 5_000;

const listeners = new Set<() => void>();

/**
 * Ask every chat badge / inbox to refresh now — after a thread is read, or
 * when a chat push arrives in the foreground.
 */
export function refreshChat() {
  listeners.forEach((l) => l());
}

/** Subscribe to refreshChat() calls. Returns an unsubscribe function. */
export function onChatRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Polls GET /chat/me (a background request — it never keeps the session
 * active) while the app is in the foreground. This poll is also what marks
 * waiting messages "delivered" for the sender.
 */
export function useChatMe() {
  const [me, setMe] = useState<ChatMe | null>(null);
  const load = useCallback(async () => {
    try {
      setMe(await chatApi.me());
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, CHAT_POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    const off = onChatRefresh(load);
    return () => {
      clearInterval(id);
      sub.remove();
      off();
    };
  }, [load]);

  return { me, reload: load };
}
