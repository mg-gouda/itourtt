"use client";

import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Camera, MapPin, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

const REQUIRED_IMAGES = 2;

/** Burn date/time + GPS text onto an image via canvas, return a new File */
function stampImage(
  file: File,
  gps: { lat: number; lng: number } | null,
): Promise<{ stamped: File; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      ctx.drawImage(img, 0, 0);

      const now = new Date();
      const dateLine = now.toLocaleString("en-GB", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const gpsLine = gps
        ? `GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`
        : "GPS: unavailable";

      const fontSize = Math.max(14, Math.min(48, Math.round(img.width * 0.02)));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textBaseline = "bottom";

      const lines = [dateLine, gpsLine];
      const lineHeight = fontSize * 1.3;
      const padding = fontSize * 0.5;

      let maxWidth = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) maxWidth = w;
      }

      const bgHeight = lines.length * lineHeight + padding * 2;
      const bgWidth = maxWidth + padding * 2;
      const bgY = img.height - bgHeight;
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, bgY, bgWidth, bgHeight);

      ctx.fillStyle = "#FFD700";
      lines.forEach((line, i) => {
        ctx.fillText(line, padding, bgY + padding + (i + 1) * lineHeight);
      });

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to export canvas"));
          const stamped = new File([blob], file.name, { type: "image/jpeg" });
          const preview = canvas.toDataURL("image/jpeg", 0.85);
          resolve({ stamped, preview });
        },
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

interface InPlaceEvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobRef: string;
  portalApiBase: string;
  onSuccess: () => void;
}

interface ImageSlot {
  file: File;
  preview: string;
}

export function InPlaceEvidenceDialog({
  open,
  onOpenChange,
  jobId,
  jobRef,
  portalApiBase,
  onSuccess,
}: InPlaceEvidenceDialogProps) {
  const t = useT();
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setImages([]);
      setGps(null);
      setGpsError(null);
      setGpsLoading(false);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError(t("noShow.geoNotSupported"));
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsLoading(false);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsError(t("noShow.permissionDenied"));
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsError(t("noShow.locationUnavailable"));
            break;
          case error.TIMEOUT:
            setGpsError(t("noShow.locationTimeout"));
            break;
          default:
            setGpsError(t("noShow.failedLocation"));
        }
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [open]);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files) return;
    const remaining = REQUIRED_IMAGES - images.length;
    const newFiles = Array.from(files).slice(0, remaining);

    for (const file of newFiles) {
      try {
        const { stamped, preview } = await stampImage(file, gps);
        setImages((prev) => {
          if (prev.length >= REQUIRED_IMAGES) return prev;
          return [...prev, { file: stamped, preview }];
        });
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          setImages((prev) => {
            if (prev.length >= REQUIRED_IMAGES) return prev;
            return [...prev, { file, preview: reader.result as string }];
          });
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = images.length === REQUIRED_IMAGES && gps && !submitting;

  const handleSubmit = async () => {
    if (images.length < REQUIRED_IMAGES || !gps) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      images.forEach((img) => formData.append("images", img.file));
      formData.append("latitude", gps.lat.toString());
      formData.append("longitude", gps.lng.toString());

      await api.post(`${portalApiBase}/jobs/${jobId}/in-place`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success(t("inPlace.success").replace("{ref}", jobRef));
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("inPlace.failedSubmit");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inPlace.title")}</DialogTitle>
          <DialogDescription>
            {t("inPlace.markJob")} <span className="font-semibold">{jobRef}</span> {t("inPlace.asInPlace")}{" "}
            {t("inPlace.uploadPhotos")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Images */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {t("inPlace.photos")} ({images.length}/{REQUIRED_IMAGES})
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-1 grid grid-cols-2 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative h-32 rounded-lg overflow-hidden border border-border">
                  <img
                    src={img.preview}
                    alt={`Evidence ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {images.length < REQUIRED_IMAGES && (
                <div
                  className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">{t("inPlace.tapToTakePhoto")}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* GPS Location */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {t("noShow.gpsLocation")}
            </label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
              {gpsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("noShow.capturingLocation")}
                  </span>
                </>
              ) : gpsError ? (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">{gpsError}</span>
                </>
              ) : gps ? (
                <>
                  <MapPin className="h-4 w-4 text-green-500" />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">
                      {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {t("noShow.viewOnMaps")}
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("inPlace.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
