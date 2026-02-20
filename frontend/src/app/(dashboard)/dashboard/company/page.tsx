"use client";

import { useEffect, useState, useRef } from "react";
import { Building2, ImageIcon, FileImage, Loader2, ShieldCheck, ShieldX, Key } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CompanySettingsData {
  companyName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  reportHeaderHtml: string | null;
  reportFooterHtml: string | null;
  licenseKey: string | null;
}

interface LicenseStatus {
  valid: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  message: string;
}

export default function CompanyPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const [companyName, setCompanyName] = useState("iTour TT");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [reportHeaderHtml, setReportHeaderHtml] = useState("");
  const [reportFooterHtml, setReportFooterHtml] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [activatingLicense, setActivatingLicense] = useState(false);

  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get("/settings/company"),
      api.get("/settings/license-status"),
    ])
      .then(([companyRes, licenseRes]) => {
        const data: CompanySettingsData = companyRes.data;
        setCompanyName(data.companyName ?? "iTour TT");
        setLogoUrl(data.logoUrl ?? null);
        setFaviconUrl(data.faviconUrl ?? null);
        setReportHeaderHtml(data.reportHeaderHtml ?? "");
        setReportFooterHtml(data.reportFooterHtml ?? "");
        setLicenseKey(data.licenseKey ?? "");
        setLicenseStatus(licenseRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUploadLogo(file: File) {
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/settings/company/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoUrl(data.url);
      toast.success(t("company.logoUploaded"));
    } catch {
      toast.error(t("company.failedLogo"));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleUploadFavicon(file: File) {
    setUploadingFavicon(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/settings/company/favicon", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFaviconUrl(data.url);
      toast.success(t("company.faviconUploaded"));
    } catch {
      toast.error(t("company.failedFavicon"));
    } finally {
      setUploadingFavicon(false);
    }
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await api.patch("/settings/company", {
        companyName,
        reportHeaderHtml: reportHeaderHtml || null,
        reportFooterHtml: reportFooterHtml || null,
      });
      toast.success(t("company.settingsSaved"));
    } catch {
      toast.error(t("company.failedSave"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("company.title")}
        description={t("company.description")}
      />

      {/* Company Identity */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-4 text-base font-medium text-foreground">
          {t("company.identity")}
        </h3>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Company Name */}
          <div className="space-y-2">
            <Label className="text-foreground/70">{t("company.companyName")}</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              placeholder="Company name"
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-foreground/70">{t("company.companyLogo")}</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
                {logoUrl ? (
                  <img
                    src={`${API_BASE}${logoUrl}`}
                    alt="Logo"
                    className="h-full w-full rounded-lg object-contain p-2"
                  />
                ) : (
                  <Building2 className="h-10 w-10 text-muted-foreground/40" />
                )}
              </div>
              <div>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadLogo(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => logoInput.current?.click()}
                  className="gap-1.5"
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  {t("company.uploadLogo")}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground/60">{t("company.logoHint")}</p>
              </div>
            </div>
          </div>

          {/* Favicon */}
          <div className="space-y-2">
            <Label className="text-foreground/70">{t("company.favicon")}</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
                {faviconUrl ? (
                  <img
                    src={`${API_BASE}${faviconUrl}`}
                    alt="Favicon"
                    className="h-full w-full rounded-lg object-contain p-1"
                  />
                ) : (
                  <FileImage className="h-5 w-5 text-muted-foreground/40" />
                )}
              </div>
              <div>
                <input
                  ref={faviconInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadFavicon(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingFavicon}
                  onClick={() => faviconInput.current?.click()}
                  className="gap-1.5"
                >
                  {uploadingFavicon ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileImage className="h-4 w-4" />
                  )}
                  {t("company.uploadFavicon")}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  {t("company.faviconHint")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Report Header */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 text-base font-medium text-foreground">
          {t("company.reportHeader")}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("company.reportHeaderDesc")}
        </p>
        <RichTextEditor
          content={reportHeaderHtml}
          onChange={setReportHeaderHtml}
          logoUrl={logoUrl}
        />
      </Card>

      {/* Report Footer */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 text-base font-medium text-foreground">
          {t("company.reportFooter")}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("company.reportFooterDesc")}
        </p>
        <RichTextEditor
          content={reportFooterHtml}
          onChange={setReportFooterHtml}
          logoUrl={logoUrl}
        />
      </Card>

      {/* Software License */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 text-base font-medium text-foreground flex items-center gap-2">
          <Key className="h-4 w-4" />
          {t("company.softwareLicense") || "Software License"}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("company.softwareLicenseDesc") || "Enter your license key to activate the software."}
        </p>

        {/* License Status */}
        {licenseStatus && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 ${licenseStatus.valid ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10"}`}>
            {licenseStatus.valid ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <ShieldX className="h-5 w-5 text-destructive shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${licenseStatus.valid ? "text-emerald-600" : "text-destructive"}`}>
                {licenseStatus.message}
              </p>
              {licenseStatus.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires: {licenseStatus.expiresAt}
                  {licenseStatus.daysRemaining !== null && ` (${licenseStatus.daysRemaining} days remaining)`}
                </p>
              )}
            </div>
            <Badge variant="outline" className={licenseStatus.valid ? "border-emerald-500/50 text-emerald-600" : "border-destructive/50 text-destructive"}>
              {licenseStatus.valid ? "Active" : "Inactive"}
            </Badge>
          </div>
        )}

        {/* License Key Input — second half masked */}
        <div className="space-y-2">
          <Label className="text-foreground/70">{t("company.licenseKey") || "License Key"}</Label>
          <div className="flex gap-2">
            <div className="flex-1 flex rounded-md border border-border bg-muted/50 overflow-hidden">
              <input
                type="text"
                readOnly
                value={licenseKey ? licenseKey.slice(0, Math.ceil(licenseKey.length / 2)) : ""}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none font-mono"
                placeholder={t("company.licenseKeyPlaceholder") || "Enter license key..."}
                tabIndex={-1}
              />
              <input
                type="password"
                readOnly
                value={licenseKey ? licenseKey.slice(Math.ceil(licenseKey.length / 2)) : ""}
                className="flex-1 bg-transparent px-0 py-2 text-sm text-foreground outline-none font-mono border-none"
                tabIndex={-1}
              />
            </div>
          </div>
          {/* Hidden actual input for pasting */}
          <div className="flex gap-2">
            <Input
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder={t("company.pasteFullKey") || "Paste full license key here to activate..."}
              className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50 font-mono text-xs"
              type="password"
            />
            <Button
              variant="outline"
              disabled={activatingLicense || !licenseKey.trim()}
              onClick={async () => {
                setActivatingLicense(true);
                try {
                  await api.patch("/settings/company", { licenseKey: licenseKey.trim() });
                  const { data } = await api.get("/settings/license-status");
                  setLicenseStatus(data);
                  if (data.valid) {
                    toast.success(t("company.licenseActivated") || "License activated successfully");
                  } else {
                    toast.error(data.message || "Invalid license key");
                  }
                } catch {
                  toast.error(t("company.licenseFailed") || "Failed to activate license");
                } finally {
                  setActivatingLicense(false);
                }
              }}
              className="gap-1.5 shrink-0"
            >
              {activatingLicense && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("company.activate") || "Activate"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={submitting}
          className="gap-1.5"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("common.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
