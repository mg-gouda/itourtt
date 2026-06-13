"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Type,
  Palette,
  Image as ImageIcon,
  Layout,
  PanelBottom,
  Globe,
  CreditCard,
  Search,
  Upload,
  LayoutGrid,
  MapPin,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
/** Prefix backend-relative URLs so images load from the API server. */
const assetUrl = (url: string | null) =>
  url && url.startsWith("/uploads/") ? `${API_BASE}${url}` : url;

const FONTS = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Poppins", label: "Poppins" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Nunito", label: "Nunito" },
  { value: "Raleway", label: "Raleway" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans" },
  { value: "Geist", label: "Geist" },
  { value: "DM Sans", label: "DM Sans" },
  { value: "Space Grotesk", label: "Space Grotesk" },
];

const HEADER_PRESETS = [
  { value: "default", label: "Default", desc: "Logo left, navigation right" },
  { value: "centered", label: "Centered", desc: "Logo centered, nav below" },
  { value: "transparent", label: "Transparent", desc: "Transparent, solid on scroll" },
  { value: "minimal", label: "Minimal", desc: "Logo + Book Now only" },
];

const FOOTER_PRESETS = [
  { value: "default", label: "Default", desc: "3-column: About, Links, Contact" },
  { value: "minimal", label: "Minimal", desc: "Single-line copyright" },
  { value: "expanded", label: "Expanded", desc: "4-column with social links" },
  { value: "centered", label: "Centered", desc: "Centered stack layout" },
];

interface WebsiteSettings {
  siteName: string;
  siteLogoUrl: string | null;
  siteFaviconUrl: string | null;
  fontFamily: string;
  primaryColor: string;
  accentColor: string;
  heroGradientFrom: string;
  heroGradientTo: string;
  navBgColor: string;
  footerBgColor: string;
  headerPreset: string;
  footerPreset: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta1Text: string;
  heroCta2Text: string;
  heroImageUrl: string | null;
  featuresEnabled: boolean;
  featuresTitle: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialTwitter: string | null;
  opsNotificationEmails: string | null;
  financeNotificationEmails: string | null;
  bankPaymentEnabled: boolean;
  bankPaymentMessage: string;
  onlinePaymentEnabled: boolean;
  cashOnArrivalEnabled: boolean;
  enableTwoWayTab: boolean;
  enableCityToCityTab: boolean;
  enableMapSelector: boolean;
  bookingTabsOrder: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

const DEFAULTS: WebsiteSettings = {
  siteName: "iTour Transfers",
  siteLogoUrl: null,
  siteFaviconUrl: null,
  fontFamily: "Inter",
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  heroGradientFrom: "#1a1a2e",
  heroGradientTo: "#0f3460",
  navBgColor: "#1a1a2e",
  footerBgColor: "#1a1a2e",
  headerPreset: "default",
  footerPreset: "default",
  heroTitle: "Book Your Airport Transfer",
  heroSubtitle: "Safe, comfortable, and reliable private transfers across Egypt.",
  heroCta1Text: "Book Now",
  heroCta2Text: "Track a Booking",
  heroImageUrl: null,
  featuresEnabled: true,
  featuresTitle: "Why Choose Us?",
  contactEmail: null,
  contactPhone: null,
  contactWhatsapp: null,
  socialFacebook: null,
  socialInstagram: null,
  socialTwitter: null,
  opsNotificationEmails: null,
  financeNotificationEmails: null,
  bankPaymentEnabled: false,
  bankPaymentMessage: "Bank payment integration coming soon!",
  onlinePaymentEnabled: true,
  cashOnArrivalEnabled: true,
  enableTwoWayTab: false,
  enableCityToCityTab: false,
  enableMapSelector: false,
  bookingTabsOrder: "ARR,DEP",
  metaTitle: null,
  metaDescription: null,
};

export default function WebsiteCmsPage() {
  const t = useT();
  const [settings, setSettings] = useState<WebsiteSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);

  useEffect(() => {
    api
      .get("/settings/website")
      .then(({ data }) => {
        const d = data.data ?? data;
        setSettings({ ...DEFAULTS, ...d });
      })
      .catch(() => toast.error("Failed to load website settings"))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: keyof WebsiteSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send fields accepted by the backend DTO
      const payload = {
        siteName: settings.siteName,
        fontFamily: settings.fontFamily,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        heroGradientFrom: settings.heroGradientFrom,
        heroGradientTo: settings.heroGradientTo,
        navBgColor: settings.navBgColor,
        footerBgColor: settings.footerBgColor,
        headerPreset: settings.headerPreset,
        footerPreset: settings.footerPreset,
        heroTitle: settings.heroTitle,
        heroSubtitle: settings.heroSubtitle,
        heroCta1Text: settings.heroCta1Text,
        heroCta2Text: settings.heroCta2Text,
        heroImageUrl: settings.heroImageUrl,
        featuresEnabled: settings.featuresEnabled,
        featuresTitle: settings.featuresTitle,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        contactWhatsapp: settings.contactWhatsapp,
        socialFacebook: settings.socialFacebook,
        socialInstagram: settings.socialInstagram,
        socialTwitter: settings.socialTwitter,
        opsNotificationEmails: settings.opsNotificationEmails,
        financeNotificationEmails: settings.financeNotificationEmails,
        bankPaymentEnabled: settings.bankPaymentEnabled,
        bankPaymentMessage: settings.bankPaymentMessage,
        onlinePaymentEnabled: settings.onlinePaymentEnabled,
        cashOnArrivalEnabled: settings.cashOnArrivalEnabled,
        enableTwoWayTab: settings.enableTwoWayTab,
        enableCityToCityTab: settings.enableCityToCityTab,
        enableMapSelector: settings.enableMapSelector,
        bookingTabsOrder: settings.bookingTabsOrder,
        metaTitle: settings.metaTitle,
        metaDescription: settings.metaDescription,
      };
      await api.patch("/settings/website", payload);
      toast.success("Website settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (
    type: "logo" | "favicon",
    file: File
  ) => {
    const setter = type === "logo" ? setUploadingLogo : setUploadingFavicon;
    setter(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/settings/website/${type}`, form, {
        headers: { "Content-Type": undefined },
      });
      const d = data.data ?? data;
      const fileUrl = d.url;
      update(type === "logo" ? "siteLogoUrl" : "siteFaviconUrl", fileUrl);
      toast.success(`${type === "logo" ? "Logo" : "Favicon"} uploaded`);
    } catch {
      toast.error(`Failed to upload ${type}`);
    } finally {
      setter(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t("websiteCms.title") || "Website CMS"}
          description={t("websiteCms.description") || "Manage your B2C public website content and styling"}
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>

      {/* Site Identity */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-medium">Site Identity</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Site Name</Label>
            <Input
              value={settings.siteName}
              onChange={(e) => update("siteName", e.target.value)}
            />
          </div>
          <div>
            <Label>Site Logo</Label>
            <div className="flex items-center gap-3">
              {settings.siteLogoUrl && (
                <img src={assetUrl(settings.siteLogoUrl)!} alt="Logo" className="h-10 rounded border object-contain" />
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {uploadingLogo ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("logo", e.target.files[0])}
                />
              </label>
            </div>
          </div>
          <div>
            <Label>Favicon</Label>
            <div className="flex items-center gap-3">
              {settings.siteFaviconUrl && (
                <img src={assetUrl(settings.siteFaviconUrl)!} alt="Favicon" className="h-8 w-8 rounded border object-contain" />
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {uploadingFavicon ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("favicon", e.target.files[0])}
                />
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Typography & Colors */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Palette className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-medium">Typography & Colors</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Font Family (Google Fonts)</Label>
            <Select value={settings.fontFamily} onValueChange={(v) => update("fontFamily", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Primary Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={settings.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label>Accent Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={settings.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label>Nav Background</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.navBgColor}
                onChange={(e) => update("navBgColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={settings.navBgColor}
                onChange={(e) => update("navBgColor", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label>Footer Background</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.footerBgColor}
                onChange={(e) => update("footerBgColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={settings.footerBgColor}
                onChange={(e) => update("footerBgColor", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label>Hero Gradient From</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.heroGradientFrom}
                onChange={(e) => update("heroGradientFrom", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={settings.heroGradientFrom}
                onChange={(e) => update("heroGradientFrom", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label>Hero Gradient To</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.heroGradientTo}
                onChange={(e) => update("heroGradientTo", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={settings.heroGradientTo}
                onChange={(e) => update("heroGradientTo", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Header Preset */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Layout className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-medium">Header Style</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HEADER_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => update("headerPreset", p.value)}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                settings.headerPreset === p.value
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-border hover:border-blue-300"
              }`}
            >
              <p className="text-sm font-medium">{p.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Footer Preset */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <PanelBottom className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-medium">Footer Style</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FOOTER_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => update("footerPreset", p.value)}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                settings.footerPreset === p.value
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-border hover:border-blue-300"
              }`}
            >
              <p className="text-sm font-medium">{p.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Hero Content */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-rose-500" />
          <h3 className="text-sm font-medium">Hero Section</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Hero Title</Label>
            <Input
              value={settings.heroTitle}
              onChange={(e) => update("heroTitle", e.target.value)}
            />
          </div>
          <div>
            <Label>Hero Subtitle</Label>
            <Input
              value={settings.heroSubtitle}
              onChange={(e) => update("heroSubtitle", e.target.value)}
            />
          </div>
          <div>
            <Label>CTA Button 1 Text</Label>
            <Input
              value={settings.heroCta1Text}
              onChange={(e) => update("heroCta1Text", e.target.value)}
            />
          </div>
          <div>
            <Label>CTA Button 2 Text</Label>
            <Input
              value={settings.heroCta2Text}
              onChange={(e) => update("heroCta2Text", e.target.value)}
            />
          </div>
        </div>

        {/* Hero Background Image */}
        <div className="mt-4">
          <Label>Background Image</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Recommended: 1920 x 1080 px (16:9). Max width 2560 px. Use JPG/WebP for best performance.
          </p>
          <div className="flex items-center gap-3">
            {settings.heroImageUrl && (
              <img
                src={assetUrl(settings.heroImageUrl)!}
                alt="Hero background"
                className="h-16 w-28 rounded border object-cover"
              />
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" />
              {uploadingHeroImage ? "Uploading..." : "Upload Image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingHeroImage(true);
                  try {
                    const form = new FormData();
                    form.append("file", file);
                    const { data } = await api.post("/settings/website/hero-image", form, {
                      headers: { "Content-Type": undefined },
                    });
                    const d = data.data ?? data;
                    update("heroImageUrl", d.url);
                    toast.success("Hero image uploaded");
                  } catch {
                    toast.error("Failed to upload hero image");
                  } finally {
                    setUploadingHeroImage(false);
                  }
                }}
              />
            </label>
            {settings.heroImageUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => update("heroImageUrl", null)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        {/* Hero preview */}
        <div className="mt-4">
          <Label className="mb-2 block">Preview</Label>
          <div
            className="relative flex h-32 items-center justify-center overflow-hidden rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${settings.heroGradientFrom}, ${settings.heroGradientTo})`,
            }}
          >
            {settings.heroImageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-20"
                style={{ backgroundImage: `url(${assetUrl(settings.heroImageUrl)})` }}
              />
            )}
            <div className="relative text-center text-white">
              <p className="text-lg font-bold">{settings.heroTitle}</p>
              <p className="text-sm opacity-80">{settings.heroSubtitle}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Features Section */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layout className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-medium">Features Section</h3>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="features-toggle" className="text-xs">Enabled</Label>
            <Switch
              id="features-toggle"
              checked={settings.featuresEnabled}
              onCheckedChange={(v) => update("featuresEnabled", v)}
            />
          </div>
        </div>
        {settings.featuresEnabled && (
          <div>
            <Label>Section Title</Label>
            <Input
              value={settings.featuresTitle}
              onChange={(e) => update("featuresTitle", e.target.value)}
            />
          </div>
        )}
      </Card>

      {/* Contact Info */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-cyan-500" />
          <h3 className="text-sm font-medium">Contact & Social</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Email</Label>
            <Input
              value={settings.contactEmail ?? ""}
              onChange={(e) => update("contactEmail", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={settings.contactPhone ?? ""}
              onChange={(e) => update("contactPhone", e.target.value || null)}
            />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input
              value={settings.contactWhatsapp ?? ""}
              onChange={(e) => update("contactWhatsapp", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Facebook URL</Label>
            <Input
              value={settings.socialFacebook ?? ""}
              onChange={(e) => update("socialFacebook", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Instagram URL</Label>
            <Input
              value={settings.socialInstagram ?? ""}
              onChange={(e) => update("socialInstagram", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Twitter / X URL</Label>
            <Input
              value={settings.socialTwitter ?? ""}
              onChange={(e) => update("socialTwitter", e.target.value || null)}
            />
          </div>
        </div>
      </Card>

      {/* Internal Booking Notifications (in addition to guest emails) */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-medium">Booking Notifications (internal)</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Internal alerts sent <strong>in addition to</strong> the confirmation emails guests
          already receive. Separate multiple addresses with commas. Leave blank to disable a
          channel.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Operations email(s) — new, amended &amp; cancelled bookings</Label>
            <Input
              placeholder="fleetbooking@fulvago.com"
              value={settings.opsNotificationEmails ?? ""}
              onChange={(e) => update("opsNotificationEmails", e.target.value || null)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Notified whenever a B2C booking is created, amended, or cancelled.
            </p>
          </div>
          <div>
            <Label>Finance email(s) — booking payments</Label>
            <Input
              placeholder="cfo@fulvago.com"
              value={settings.financeNotificationEmails ?? ""}
              onChange={(e) => update("financeNotificationEmails", e.target.value || null)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Notified whenever a B2C booking is paid online.
            </p>
          </div>
        </div>
      </Card>

      {/* Payment Methods (master switches shown to guests at checkout) */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-medium">Payment Methods</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Control which payment options guests can choose when booking. Turning one off
          hides it on the website immediately. At least one should stay enabled.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Online Payment</p>
              <p className="text-xs text-muted-foreground">Secure card payment via GetPayIn</p>
            </div>
            <Switch
              id="online-payment-toggle"
              checked={settings.onlinePaymentEnabled}
              onCheckedChange={(v) => update("onlinePaymentEnabled", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Pay Cash Upon Arrival</p>
              <p className="text-xs text-muted-foreground">Guest pays the driver in cash</p>
            </div>
            <Switch
              id="cash-toggle"
              checked={settings.cashOnArrivalEnabled}
              onCheckedChange={(v) => update("cashOnArrivalEnabled", v)}
            />
          </div>
          {!settings.onlinePaymentEnabled && !settings.cashOnArrivalEnabled && (
            <div className="rounded-lg border border-dashed border-red-500/40 bg-red-500/5 p-3 text-center">
              <p className="text-xs text-red-600 dark:text-red-400">
                Both methods are off — guests won&apos;t be able to complete a booking.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Booking Widget (master switches for the new search tabs & map picker) */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-medium">Booking Widget</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Turn the extra booking search options and the map place picker on or off. Changes
          show on the website immediately. The Airport Transfer tab is always available.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Return Transfer option</p>
              <p className="text-xs text-muted-foreground">
                Shows the &quot;Return Transfer&quot; choice in the Airport Transfer tab
                (books arrival + departure in one go)
              </p>
            </div>
            <Switch
              id="two-way-toggle"
              checked={settings.enableTwoWayTab}
              onCheckedChange={(v) => update("enableTwoWayTab", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">City-to-City tab</p>
              <p className="text-xs text-muted-foreground">
                Point-to-point transfers between cities (excursion)
              </p>
            </div>
            <Switch
              id="city-to-city-toggle"
              checked={settings.enableCityToCityTab}
              onCheckedChange={(v) => update("enableCityToCityTab", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <MapPin className="h-3.5 w-3.5" /> Google Maps place picker
              </p>
              <p className="text-xs text-muted-foreground">
                Let guests pick an exact pickup/drop-off point on the map
              </p>
            </div>
            <Switch
              id="map-selector-toggle"
              checked={settings.enableMapSelector}
              onCheckedChange={(v) => update("enableMapSelector", v)}
            />
          </div>
        </div>
      </Card>

      {/* Bank Payment */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-medium">Bank Payment Integration</h3>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="bank-toggle" className="text-xs">Enabled</Label>
            <Switch
              id="bank-toggle"
              checked={settings.bankPaymentEnabled}
              onCheckedChange={(v) => update("bankPaymentEnabled", v)}
            />
          </div>
        </div>
        {!settings.bankPaymentEnabled && (
          <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center">
            <p className="text-sm text-amber-600 dark:text-amber-400">Coming Soon</p>
            <Input
              className="mt-2"
              value={settings.bankPaymentMessage}
              onChange={(e) => update("bankPaymentMessage", e.target.value)}
              placeholder="Coming soon message..."
            />
          </div>
        )}
      </Card>

      {/* SEO */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-green-500" />
          <h3 className="text-sm font-medium">SEO</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Meta Title</Label>
            <Input
              value={settings.metaTitle ?? ""}
              onChange={(e) => update("metaTitle", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Meta Description</Label>
            <Textarea
              value={settings.metaDescription ?? ""}
              onChange={(e) => update("metaDescription", e.target.value || null)}
              rows={2}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
