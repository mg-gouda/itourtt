"use client";

import dynamic from "next/dynamic";
import { Check, CheckCheck, ExternalLink, Loader2, MapPin, Navigation, RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  chatTime,
  directionsUrl,
  fmtDuration,
  mapsUrl,
  useAttachmentUrl,
  type ChatMessage,
  type ChatMessageStatus,
} from "@/lib/chat";

const ChatLocationMap = dynamic(() => import("./chat-location-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

/**
 * ✓ sent · ✓✓ delivered · ✓✓ (highlighted) seen. `onPrimary` when drawn on the
 * sender's primary-coloured bubble, where the "seen" colour must contrast.
 */
export function StatusTicks({
  status,
  onPrimary,
  className,
}: {
  status: ChatMessageStatus;
  onPrimary?: boolean;
  className?: string;
}) {
  const t = useT();
  const label = t(status === "SEEN" ? "chat.seen" : status === "DELIVERED" ? "chat.delivered" : "chat.sent");
  if (status === "SENT") {
    return <Check className={cn("h-3.5 w-3.5 shrink-0", className)} aria-label={label} role="img" />;
  }
  return (
    <CheckCheck
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        className,
        status === "SEEN" && (onPrimary ? "text-emerald-200" : "text-sky-500"),
      )}
      strokeWidth={status === "SEEN" ? 3 : 2}
      aria-label={label}
      role="img"
    />
  );
}

/** Map preview + "open" / "directions" links for a LOCATION message. */
export function LocationCard({
  latitude,
  longitude,
  accuracyM,
  fromMe,
}: {
  latitude: number;
  longitude: number;
  accuracyM: number | null | undefined;
  fromMe: boolean;
}) {
  const t = useT();
  return (
    <div className="-mx-1.5 -mt-0.5 mb-1 w-60 max-w-full overflow-hidden rounded-xl bg-background text-foreground">
      <a
        href={mapsUrl(latitude, longitude)}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-32"
        aria-label={t("chat.openInMaps")}
      >
        <ChatLocationMap latitude={latitude} longitude={longitude} accuracyM={accuracyM ?? null} />
      </a>
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1 truncate tabular-nums text-muted-foreground" dir="ltr">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
          {accuracyM ? ` · ±${accuracyM} m` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 border-t border-border text-xs font-medium">
        <a
          href={mapsUrl(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 py-1.5 hover:bg-muted"
        >
          <ExternalLink className="h-3 w-3" />
          {t("chat.openInMaps")}
        </a>
        <a
          href={directionsUrl(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("flex items-center justify-center gap-1 border-s border-border py-1.5 hover:bg-muted", fromMe && "")}
        >
          <Navigation className="h-3 w-3" />
          {t("chat.directions")}
        </a>
      </div>
    </div>
  );
}

/**
 * One chat bubble: photo / voice note / location / text, time and — on the
 * caller's own messages — the delivery ticks. Shared by 1:1 threads,
 * announcements and the broadcast history.
 */
export function ChatBubble({
  m,
  localeId,
  status,
  attachmentPath,
  heading,
  footer,
  onRetry,
  onDiscard,
}: {
  m: ChatMessage;
  localeId: string;
  /** Ticks to draw (own messages only); null hides them. */
  status: ChatMessageStatus | null;
  /** API path the attachment is fetched from. */
  attachmentPath: string | null;
  /** Line above the content (e.g. the announcement's sender). */
  heading?: React.ReactNode;
  /** Extra line under the time (e.g. broadcast receipt counts). */
  footer?: React.ReactNode;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const t = useT();
  const remote = useAttachmentUrl(attachmentPath, m.hasAttachment && !m.localUrl && !m.pending && !m.failed);
  const src = m.localUrl ?? remote.url;

  return (
    <div className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
          m.fromMe ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card text-foreground",
          m.pending && "opacity-70",
          m.failed && "ring-2 ring-destructive",
        )}
      >
        {heading && <div className="mb-0.5 text-[11px] font-semibold opacity-90">{heading}</div>}
        {m.kind === "IMAGE" &&
          (src ? (
            <a href={src} target="_blank" rel="noopener noreferrer" className="-mx-1.5 -mt-0.5 mb-1 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={t("chat.photo")} className="max-h-64 w-full rounded-xl object-cover" />
            </a>
          ) : (
            <div className="mb-1 flex h-32 w-48 items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
              {remote.error ? t("chat.attachmentFailed") : <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          ))}
        {m.kind === "VOICE" &&
          (src ? (
            <audio controls preload="metadata" src={src} className="h-10 w-60 max-w-full" />
          ) : (
            <div className="flex h-10 w-56 items-center gap-2 text-xs opacity-80">
              {remote.error ? t("chat.attachmentFailed") : <Loader2 className="h-4 w-4 animate-spin" />}
              {m.durationSec ? fmtDuration(m.durationSec) : null}
            </div>
          ))}
        {m.kind === "LOCATION" && m.latitude != null && m.longitude != null && (
          <LocationCard latitude={m.latitude} longitude={m.longitude} accuracyM={m.accuracyM} fromMe={m.fromMe} />
        )}
        {m.body && <p className="whitespace-pre-wrap break-words" dir="auto">{m.body}</p>}
        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            m.fromMe ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {m.kind === "VOICE" && m.durationSec ? <span>{fmtDuration(m.durationSec)} ·</span> : null}
          <span>{chatTime(m.createdAt, localeId)}</span>
          {m.fromMe &&
            (m.pending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-label={t("chat.sending")} />
            ) : m.failed || !status ? null : (
              <StatusTicks status={status} onPrimary />
            ))}
        </div>
        {footer}
        {m.failed && (
          <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
            <span>{t("chat.notSent")}</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-0.5 underline">
                <RotateCw className="h-3 w-3" />
                {t("chat.retry")}
              </button>
            )}
            {onDiscard && (
              <button type="button" onClick={onDiscard} className="underline">
                {t("chat.discard")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
