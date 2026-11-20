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
import { Loader2, Camera, MapPin, AlertCircle, X, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useGeoCapture } from "@/lib/use-geo-capture";
import { compressImages } from "@/lib/compress-image";


interface CompletedEvidenceDialogProps {
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

/** GET {portal}/jobs/:id/odometer — owned car → odometer photo read by AI (driver portal only). */
interface OdometerStatus {
  required: boolean;
  plateNumber: string | null;
  readingKm: number | null;
  source: string | null;
  aiAttempts: number;
  hasPhoto: boolean;
  canType: boolean;
}

export function CompletedEvidenceDialog({
  open,
  onOpenChange,
  jobId,
  jobRef,
  portalApiBase,
  onSuccess,
}: CompletedEvidenceDialogProps) {
  const t = useT();
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const odoInputRef = useRef<HTMLInputElement>(null);
  const [odo, setOdo] = useState<OdometerStatus | null>(null);
  const [odoBusy, setOdoBusy] = useState(false);
  const [typedKm, setTypedKm] = useState("");
  const isDriver = portalApiBase === "/driver-portal";

  const { gps, gpsError, gpsLoading, retry } = useGeoCapture(open);

  // Reset selected images whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setImages([]);
      setOdo(null);
      setTypedKm("");
    }
  }, [open]);

  // Owned car? Then completing needs the odometer photo (read by AI on the server).
  useEffect(() => {
    if (!open || !isDriver || !jobId) return;
    api
      .get(`${portalApiBase}/jobs/${jobId}/odometer`)
      .then(({ data }) => setOdo(data.data))
      .catch(() => setOdo(null));
  }, [open, isDriver, jobId, portalApiBase]);

  const captureOdometer = async (file?: File) => {
    if (!file) return;
    setOdoBusy(true);
    try {
      const [small] = await compressImages([file]);
      const fd = new FormData();
      fd.append("image", small);
      const { data } = await api.post(`${portalApiBase}/jobs/${jobId}/odometer`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      setOdo(data.data);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || t("completed.odometerUnreadable"));
    } finally {
      setOdoBusy(false);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 10 - images.length);
    for (const file of newFiles) {
      const preview = URL.createObjectURL(file);
      setImages((prev) => {
        if (prev.length >= 10) return prev;
        return [...prev, { file, preview }];
      });
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const odoReady =
    !odo?.required || odo.readingKm != null || (odo.canType && Number(typedKm) > 0);
  const canSubmit = images.length >= 1 && !submitting && !!gps && odoReady && !odoBusy;

  const handleSubmit = async () => {
    if (images.length < 1) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      const files = await compressImages(images.map((img) => img.file));
      files.forEach((file) => formData.append("images", file));
      if (gps) {
        formData.append("latitude", gps.lat.toString());
        formData.append("longitude", gps.lng.toString());
      }
      if (odo?.required && odo.readingKm == null && typedKm) formData.append("odometerKm", typedKm);

      await api.post(`${portalApiBase}/jobs/${jobId}/completed`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success(t("completed.success").replace("{ref}", jobRef));
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("completed.failedSubmit");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("completed.title")}</DialogTitle>
          <DialogDescription>
            {t("completed.markJob")} <span className="font-semibold">{jobRef}</span> {t("completed.asCompleted")} {t("completed.uploadPhotos")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Images */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {t("completed.photos")} ({images.length})
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

            <div className="mt-1 grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative h-24 rounded-lg overflow-hidden border border-border">
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

              {images.length < 10 && (
                <div
                  className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50"
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

          {/* Odometer (owned cars): photo → AI reads the km into a read-only field */}
          {odo?.required && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Gauge className="h-4 w-4" />
                {t("completed.odometer")}
                {odo.plateNumber && <span className="text-muted-foreground font-normal">· {odo.plateNumber}</span>}
              </label>
              <input
                ref={odoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  captureOdometer(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="mt-1 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => odoInputRef.current?.click()}
                  disabled={odoBusy || submitting}
                >
                  {odoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                  {odoBusy ? t("completed.odometerReadingNow") : odo.hasPhoto ? t("completed.odometerRetake") : t("completed.odometerPhoto")}
                </Button>
                <div>
                  <label className="text-xs text-muted-foreground">{t("completed.odometerReading")}</label>
                  {odo.readingKm != null ? (
                    <Input readOnly value={odo.readingKm.toLocaleString("en-US")} className="mt-1 h-9 bg-background font-semibold tabular-nums" />
                  ) : odo.canType ? (
                    <Input
                      inputMode="numeric"
                      placeholder={t("completed.odometerType")}
                      value={typedKm}
                      onChange={(e) => setTypedKm(e.target.value.replace(/[^\d]/g, ""))}
                      className="mt-1 h-9 bg-background tabular-nums"
                    />
                  ) : (
                    <Input readOnly value="" placeholder="—" className="mt-1 h-9 bg-background" />
                  )}
                </div>
                {odo.readingKm == null && odo.aiAttempts > 0 && !odo.canType && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t("completed.odometerUnreadable")}
                  </p>
                )}
                {!odo.hasPhoto && <p className="text-xs text-muted-foreground">{t("completed.odometerRequired")}</p>}
              </div>
            </div>
          )}

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
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-sm text-destructive">{gpsError}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={retry}
                      className="ml-auto h-7 px-2 text-xs"
                    >
                      {t("noShow.retryLocation")}
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("noShow.locationRequired")}
                  </span>
                </div>
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
            className="bg-green-600 hover:bg-green-700"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("completed.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
