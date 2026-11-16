"use client";

import api from "@/lib/api";

/**
 * Browser push for the rep/driver web portals. The service worker is
 * /sw.js; the server side is backend/src/push-notifications/web-push.*.
 */

export type PushSupport =
  | "supported"
  /** iPhone/iPad Safari: push only works once the site is added to the Home Screen. */
  | "ios-needs-install"
  | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (hasApis) return "supported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone ? "ios-needs-install" : "unsupported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

let publicKeyPromise: Promise<string | null> | null = null;
function serverKey(): Promise<string | null> {
  publicKeyPromise ??= api
    .get("/push/web/public-key")
    .then(({ data }) => (data?.data?.publicKey as string | null) ?? null)
    .catch(() => {
      publicKeyPromise = null;
      return null;
    });
  return publicKeyPromise;
}

/** True when the server has push configured. */
export async function pushAvailable(): Promise<boolean> {
  return pushSupport() === "supported" && !!(await serverKey());
}

/**
 * Subscribe this browser for the signed-in user and tell the server. Safe to
 * call on every portal load: re-posting re-binds the browser to the current
 * user (a shared phone must not keep notifying the previous one).
 * Only asks for permission when `ask` is true — call that from a tap.
 */
export async function ensurePushSubscription(ask: boolean): Promise<NotificationPermission | "unavailable"> {
  if (pushSupport() !== "supported") return "unavailable";
  const key = await serverKey();
  if (!key) return "unavailable";

  let perm = Notification.permission;
  if (perm === "default" && ask) perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;

  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for a different server key (keys rotated) is useless.
  const current = sub?.options.applicationServerKey;
  if (sub && current) {
    const a = new Uint8Array(current);
    const b = urlBase64ToUint8Array(key);
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });

  const json = sub.toJSON();
  await api.post("/push/web/subscribe", { endpoint: json.endpoint, keys: json.keys });
  return "granted";
}

/** On logout: stop this browser receiving the user's pushes. Never throws. */
export async function dropPushSubscription(): Promise<void> {
  try {
    if (pushSupport() !== "supported") return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api.post("/push/web/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* best effort */
  }
}
