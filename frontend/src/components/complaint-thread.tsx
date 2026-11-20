"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2, Paperclip, Send, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * A complaint answer thread between the office and the rep / driver it blames
 * (backend: complaints/complaint-thread.service.ts). Used by the rep / driver portals
 * and by the admin complaint view (one per party).
 */
export interface ThreadAttachment {
  id: string;
  fileName: string;
  mimeType: string | null;
  createdAt: string;
}
export interface ThreadMessage {
  id: string;
  authorType: "REP" | "DRIVER" | "STAFF";
  authorName: string | null;
  message: string;
  createdAt: string;
  attachments: ThreadAttachment[];
}

const MAX_FILES = 10;
const MAX_BYTES = 15 * 1024 * 1024;

/** A file behind the JWT: fetched as a blob, shown as a thumbnail (image) or a link (PDF). */
export function AuthedFile({ url, file }: { url: string; file: ThreadAttachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = (file.mimeType ?? "").startsWith("image/");
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    api
      .get(url, { responseType: "blob" })
      .then(({ data }) => {
        if (!alive) return;
        revoke = URL.createObjectURL(data as Blob);
        setSrc(revoke);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);

  const open = () => src && window.open(src, "_blank", "noopener");
  if (isImage) {
    return (
      <button
        type="button"
        onClick={open}
        title={file.fileName}
        className="h-20 w-20 overflow-hidden rounded-md border bg-muted flex items-center justify-center"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={file.fileName} className="h-full w-full object-cover" />
        ) : failed ? (
          <X className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={!src}
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
    >
      <FileText className="h-3.5 w-3.5" />
      <span className="max-w-[160px] truncate">{file.fileName}</span>
    </button>
  );
}

export function ComplaintThread({
  messages,
  fileUrl,
  mine,
  labels,
  locale,
}: {
  messages: ThreadMessage[];
  fileUrl: (attachmentId: string) => string;
  /** Which author types are "this side" (drawn on the right). */
  mine: (m: ThreadMessage) => boolean;
  labels: { office: string; empty: string };
  locale?: string;
}) {
  if (!messages.length) {
    return <p className="text-sm text-muted-foreground py-2">{labels.empty}</p>;
  }
  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const right = mine(m);
        return (
          <div key={m.id} className={cn("flex", right ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                right ? "bg-primary/10 border-primary/30" : "bg-muted",
              )}
            >
              <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                {m.authorType === "STAFF" ? `${labels.office}${m.authorName ? ` · ${m.authorName}` : ""}` : m.authorName}
                {" · "}
                {new Date(m.createdAt).toLocaleString(locale ?? "en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {m.message && <div className="whitespace-pre-wrap break-words">{m.message}</div>}
              {m.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <AuthedFile key={a.id} url={fileUrl(a.id)} file={a} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Text + images / PDF (gallery, camera or file). Posts multipart `message` + `files` (+ extra fields). */
export function ThreadComposer({
  postUrl,
  extra,
  onSent,
  labels,
}: {
  postUrl: string;
  extra?: Record<string, string>;
  onSent: () => void;
  labels: { placeholder: string; attach: string; camera: string; send: string; sent: string; tooMany: string; tooBig: string; needSomething: string };
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: ${labels.tooBig}`);
        continue;
      }
      next.push(f);
    }
    if (next.length > MAX_FILES) toast.error(labels.tooMany);
    setFiles(next.slice(0, MAX_FILES));
  };

  const send = async () => {
    if (!text.trim() && !files.length) {
      toast.error(labels.needSomething);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("message", text.trim());
      for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
      for (const f of files) fd.append("files", f);
      await api.post(postUrl, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setText("");
      setFiles([]);
      toast.success(labels.sent);
      onSent();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string | string[] } } };
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={labels.placeholder}
        rows={3}
        disabled={busy}
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="remove">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Paperclip className="mr-1 h-4 w-4" />
          {labels.attach}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => camRef.current?.click()} disabled={busy}>
          <Camera className="mr-1 h-4 w-4" />
          {labels.camera}
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={send} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          {labels.send}
        </Button>
      </div>
    </div>
  );
}
