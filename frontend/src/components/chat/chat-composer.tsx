"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, MapPin, Mic, Send, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "./emoji-picker";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CHAT_MAX_FILE_BYTES,
  fmtDuration,
  getCurrentPosition,
  shrinkImage,
  useVoiceRecorder,
  type ChatKind,
  type ChatMessage,
  type LocationError,
} from "@/lib/chat";

export interface ChatComposerProps {
  disabled?: boolean;
  /**
   * Called with the multipart form to POST and a preview of the message for
   * optimistic display. The composer has already cleared its own input.
   */
  onSend: (kind: ChatKind, form: FormData, preview: Partial<ChatMessage>) => void;
  placeholder?: string;
  className?: string;
}

/** First image file in a clipboard / drag payload. */
function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return Array.from(data.files ?? []).find((f) => f.type.startsWith("image/")) ?? null;
}

/**
 * Message composer: text, photo (pick, paste a screenshot, or drop), voice
 * note and current location. Pasted / dropped images wait in a preview so a
 * caption can be typed before sending.
 */
export function ChatComposer({ disabled, onSend, placeholder, className }: ChatComposerProps) {
  const t = useT();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ blob: Blob; url: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // The staged preview's object URL is handed to the sent message, so only
  // revoke it when the preview is thrown away (see discardStaged).
  const discardStaged = () => {
    setStaged((s) => {
      if (s) URL.revokeObjectURL(s.url);
      return null;
    });
  };
  const stagedUrl = useRef<string | null>(null);
  useEffect(() => {
    stagedUrl.current = staged?.url ?? null;
  }, [staged]);
  // Leaving the thread with an unsent preview: free it.
  useEffect(
    () => () => {
      if (stagedUrl.current) URL.revokeObjectURL(stagedUrl.current);
    },
    [],
  );

  const prepareImage = async (file: File): Promise<Blob | null> => {
    if (!file.type.startsWith("image/")) return null;
    const blob = await shrinkImage(file);
    if (blob.size > CHAT_MAX_FILE_BYTES) {
      setNotice(t("chat.tooLarge"));
      return null;
    }
    return blob;
  };

  const sendImageBlob = (blob: Blob, url: string) => {
    const form = new FormData();
    form.append("kind", "IMAGE");
    form.append("file", blob, "photo.jpg");
    const caption = text.trim();
    if (caption) form.append("body", caption);
    setText("");
    onSend("IMAGE", form, { body: caption || null, localUrl: url, hasAttachment: true });
  };

  /** Picked from the file dialog: sent at once (with any typed caption), as on phones. */
  const pickImage = async (file: File) => {
    const blob = await prepareImage(file);
    if (blob) sendImageBlob(blob, URL.createObjectURL(blob));
  };

  /** Pasted or dropped: staged for a caption first. */
  const stageImage = async (file: File) => {
    const blob = await prepareImage(file);
    if (!blob) return;
    discardStaged();
    setStaged({ blob, url: URL.createObjectURL(blob) });
    setNotice(null);
    textRef.current?.focus();
  };

  const submit = () => {
    if (disabled) return;
    if (staged) {
      sendImageBlob(staged.blob, staged.url);
      setStaged(null);
      return;
    }
    const body = text.trim();
    if (!body) return;
    const form = new FormData();
    form.append("kind", "TEXT");
    form.append("body", body);
    setText("");
    onSend("TEXT", form, { body });
  };

  const shareLocation = async () => {
    setLocating(true);
    setNotice(null);
    try {
      const pos = await getCurrentPosition();
      const form = new FormData();
      form.append("kind", "LOCATION");
      form.append("latitude", String(pos.latitude));
      form.append("longitude", String(pos.longitude));
      if (pos.accuracyM !== null) form.append("accuracyM", String(pos.accuracyM));
      const caption = text.trim();
      if (caption) form.append("body", caption);
      setText("");
      onSend("LOCATION", form, { ...pos, body: caption || null, hasAttachment: false });
    } catch (e) {
      const code = e as LocationError;
      setNotice(
        t(code === "denied" ? "chat.locationDenied" : code === "unsupported" ? "chat.locationUnsupported" : "chat.locationFailed"),
      );
    } finally {
      setLocating(false);
    }
  };

  /** Emoji at the cursor (or replacing the selection), then back to typing. */
  const insertEmoji = (emoji: string) => {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, 4000);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const recorder = useVoiceRecorder((blob, secs) => {
    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("kind", "VOICE");
    form.append("durationSec", String(secs));
    form.append("file", blob, `voice.${ext}`);
    onSend("VOICE", form, { durationSec: secs, localUrl: URL.createObjectURL(blob), hasAttachment: true });
  });
  const recording = recorder.state === "recording";
  const micNotice =
    recorder.state === "denied" ? t("chat.micDenied") : recorder.state === "unsupported" ? t("chat.micUnsupported") : null;

  return (
    <div
      className={cn("relative shrink-0", className)}
      onDragOver={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        setDragging(false);
        const f = imageFrom(e.dataTransfer);
        if (!f || disabled) return;
        e.preventDefault();
        stageImage(f);
      }}
    >
      {(notice || micNotice) && (
        <div className="flex items-start gap-2 border-t border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{notice ?? micNotice}</span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              setNotice(null);
              recorder.reset();
            }}
          >
            {t("chat.dismiss")}
          </button>
        </div>
      )}

      {staged && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={staged.url} alt={t("chat.photo")} className="h-16 max-w-[8rem] rounded-md border border-border object-cover" />
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t("chat.pastedImageHint")}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={discardStaged} aria-label={t("chat.removeImage")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-1 border-t border-border bg-card p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) pickImage(f);
          }}
        />
        {recording ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 text-destructive"
              onClick={() => recorder.stop(true)}
              aria-label={t("chat.cancelRecording")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex h-10 flex-1 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 text-sm">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              <span className="tabular-nums">{fmtDuration(recorder.seconds)}</span>
              <span className="truncate text-xs text-muted-foreground">{t("chat.recording")}</span>
            </div>
            <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => recorder.stop()} aria-label={t("chat.sendVoice")}>
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-9 shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              aria-label={t("chat.attachImage")}
              title={t("chat.attachImage")}
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-9 shrink-0"
              onClick={shareLocation}
              disabled={disabled || locating || !!staged}
              aria-label={t("chat.shareLocation")}
              title={t("chat.shareLocation")}
            >
              {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
            </Button>
            <EmojiPicker onPick={insertEmoji} disabled={disabled} />
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              onPaste={(e) => {
                const f = imageFrom(e.clipboardData);
                if (!f) return; // plain text pastes normally
                e.preventDefault();
                stageImage(f);
              }}
              rows={1}
              maxLength={4000}
              placeholder={staged ? t("chat.captionPlaceholder") : (placeholder ?? t("chat.placeholder"))}
              disabled={disabled}
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              dir="auto"
            />
            {text.trim() || staged ? (
              <Button size="icon" className="h-10 w-10 shrink-0" onClick={submit} disabled={disabled} aria-label={t("chat.send")}>
                <Send className="h-4 w-4 rtl:rotate-180" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={recorder.start}
                disabled={disabled}
                aria-label={t("chat.recordVoice")}
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 text-xs font-medium text-primary">
          {t("chat.dropImage")}
        </div>
      )}
    </div>
  );
}
