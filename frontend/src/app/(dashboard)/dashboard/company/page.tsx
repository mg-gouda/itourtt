"use client";

import { useEffect, useState, useRef } from "react";
import { Building2, ImageIcon, FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface CompanySettingsData {
  companyName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  reportHeaderHtml: string | null;
  reportFooterHtml: string | null;
}

export default function CompanyPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const [companyName, setCompanyName] = useState("iTour TT");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [reportHeaderHtml, setReportHeaderHtml] = useState("");
  const [reportFooterHtml, setReportFooterHtml] = useState("");

  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get("/settings/company")
      .then(({ data }: { data: CompanySettingsData }) => {
        setCompanyName(data.companyName ?? "iTour TT");
        setLogoUrl(data.logoUrl ?? null);
        setFaviconUrl(data.faviconUrl ?? null);
        setReportHeaderHtml(data.reportHeaderHtml ?? "");
        setReportFooterHtml(data.reportFooterHtml ?? "");
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
      toast.success("Logo uploaded");
    } catch {
      toast.error("Failed to upload logo");
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
      toast.success("Favicon uploaded");
    } catch {
      toast.error("Failed to upload favicon");
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
      toast.success("Company settings saved");
    } catch {
      toast.error("Failed to save settings");
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
        title="Company"
        description="Manage company branding, logo, and report templates"
      />

      {/* Company Identity */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-4 text-base font-medium text-foreground">
          Company Identity
        </h3>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Company Name */}
          <div className="space-y-2">
            <Label className="text-foreground/70">Company Name</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              placeholder="Company name"
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-foreground/70">Company Logo</Label>
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
                  Upload Logo
                </Button>
                <p className="mt-1 text-xs text-muted-foreground/60">PNG, JPG up to 2MB</p>
              </div>
            </div>
          </div>

          {/* Favicon */}
          <div className="space-y-2">
            <Label className="text-foreground/70">Favicon</Label>
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
                  Upload Favicon
                </Button>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  16x16 or 32x32 PNG
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Report Header */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 text-base font-medium text-foreground">
          Report Header
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          HTML content displayed at the top of generated reports
        </p>
        <textarea
          rows={6}
          value={reportHeaderHtml}
          onChange={(e) => setReportHeaderHtml(e.target.value)}
          placeholder="Enter report header HTML..."
          className="w-full resize-y rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </Card>

      {/* Report Footer */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 text-base font-medium text-foreground">
          Report Footer
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          HTML content displayed at the bottom of generated reports
        </p>
        <textarea
          rows={6}
          value={reportFooterHtml}
          onChange={(e) => setReportFooterHtml(e.target.value)}
          placeholder="Enter report footer HTML..."
          className="w-full resize-y rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={submitting}
          className="gap-1.5"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
