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
import { Loader2, Camera, MapPin, ImageIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface NoShowEvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobRef: string;
  portalApiBase: string; // e.g. "/rep-portal" or "/driver-portal"
  onSuccess: () => void;
}

export function NoShowEvidenceDialog({
  open,
  onOpenChange,
  jobId,
  jobRef,
  portalApiBase,
  onSuccess,
}: NoShowEvidenceDialogProps) {
  const t = useT();
  const [image1, setImage1] = useState<File | null>(null);
  const [image2, setImage2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const file1Ref = useRef<HTMLInputElement>(null);
  const file2Ref = useRef<HTMLInputElement>(null);

  // Capture GPS on dialog open
  useEffect(() => {
    if (!open) {
      // Reset state on close
      setImage1(null);
      setImage2(null);
      setPreview1(null);
      setPreview2(null);
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

  const handleFileChange = (
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (p: string | null) => void,
  ) => {
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSubmit = image1 && image2 && gps && !submitting;

  const handleSubmit = async () => {
    if (!image1 || !image2 || !gps) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("images", image1);
      formData.append("images", image2);
      formData.append("latitude", gps.lat.toString());
      formData.append("longitude", gps.lng.toString());

      await api.post(`${portalApiBase}/jobs/${jobId}/no-show`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success(`Job ${jobRef} marked as NO SHOW with evidence`);
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("noShow.failedSubmit");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("noShow.title")}</DialogTitle>
          <DialogDescription>
            {t("noShow.markJob")} <span className="font-semibold">{jobRef}</span> {t("noShow.asNoShow")}{" "}
            {t("noShow.uploadPhotos")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image 1 */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {t("noShow.photo1")}
            </label>
            <input
              ref={file1Ref}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                handleFileChange(e.target.files?.[0], setImage1, setPreview1)
              }
            />
            <div
              className="mt-1 flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50"
              onClick={() => file1Ref.current?.click()}
            >
              {preview1 ? (
                <img
                  src={preview1}
                  alt="Evidence 1"
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Camera className="h-6 w-6" />
                  <span className="text-xs">{t("noShow.tapToTakePhoto")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Image 2 */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {t("noShow.photo2")}
            </label>
            <input
              ref={file2Ref}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                handleFileChange(e.target.files?.[0], setImage2, setPreview2)
              }
            />
            <div
              className="mt-1 flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50"
              onClick={() => file2Ref.current?.click()}
            >
              {preview2 ? (
                <img
                  src={preview2}
                  alt="Evidence 2"
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Camera className="h-6 w-6" />
                  <span className="text-xs">{t("noShow.tapToTakePhoto")}</span>
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
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("noShow.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
