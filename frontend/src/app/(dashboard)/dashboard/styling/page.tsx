"use client";

import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  Type,
  Languages,
  Palette,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { useT } from "@/lib/i18n";

// ─── Font options ────────────────────────────────────────────────
const FONTS = [
  { value: "Geist", label: "Geist (Default)" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Poppins", label: "Poppins" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Nunito", label: "Nunito" },
  { value: "Raleway", label: "Raleway" },
  { value: "Source Sans 3", label: "Source Sans Pro" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans" },
  { value: "Aref Ruqaa", label: "Aref Ruqaa (Arabic)" },
  { value: "Beiruti", label: "Beiruti (Arabic)" },
  { value: "El Messiri", label: "El Messiri (Arabic)" },
];

// ─── Language options ────────────────────────────────────────────
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "tr", label: "Turkish" },
  { value: "zh", label: "Chinese (Simplified)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ru", label: "Russian" },
  { value: "hi", label: "Hindi" },
];

export default function StylingPage() {
  const t = useT();
  const { settings, updateSettings } = useTheme();
  const [theme, setTheme] = useState("dark");
  const [fontFamily, setFontFamily] = useState("Geist");
  const [language, setLanguage] = useState("en");
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");
  const [accentColor, setAccentColor] = useState("#8b5cf6");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get("/settings/system")
      .then(({ data }) => {
        setTheme(data.theme ?? "dark");
        setFontFamily(data.fontFamily ?? "Geist");
        setLanguage(data.language ?? "en");
        setPrimaryColor(data.primaryColor ?? "#3b82f6");
        setAccentColor(data.accentColor ?? "#8b5cf6");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSubmitting(true);
    try {
      await api.patch("/settings/system", {
        theme,
        fontFamily,
        language,
        primaryColor,
        accentColor,
      });
      // Also update theme provider
      await updateSettings({ theme: theme as "light" | "dark", fontFamily, language, primaryColor, accentColor });
      toast.success(t("styling.settingsSaved"));
    } catch {
      toast.error(t("styling.failedSave"));
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
        title={t("styling.title")}
        description={t("styling.description")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Theme Card */}
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            {theme === "dark" ? (
              <Moon className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Sun className="h-5 w-5 text-muted-foreground" />
            )}
            <h3 className="text-base font-medium text-foreground">{t("styling.themeMode")}</h3>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("styling.themeModeDesc")}
          </p>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
            <Label className="text-foreground/70">{t("styling.darkMode")}</Label>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) =>
                setTheme(checked ? "dark" : "light")
              }
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("styling.currentlyUsing")} {theme} {t("styling.mode")}
          </p>
        </Card>

        {/* Font Card */}
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Type className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">{t("styling.displayFont")}</h3>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("styling.fontDesc")}
          </p>
          <Select value={fontFamily} onValueChange={setFontFamily}>
            <SelectTrigger className="border-border bg-muted/50 text-foreground">
              <SelectValue placeholder={t("styling.selectFont")} />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-popover-foreground">
              {FONTS.map((f) => (
                <SelectItem
                  key={f.value}
                  value={f.value}
                  className="focus:bg-accent focus:text-accent-foreground"
                >
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p
            className="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            style={{
              fontFamily:
                fontFamily === "Geist" ? undefined : `"${fontFamily}", sans-serif`,
            }}
          >
            The quick brown fox jumps over the lazy dog
          </p>
        </Card>

        {/* Language Card */}
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Languages className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">
              {t("styling.displayLanguage")}
            </h3>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("styling.languageDesc")}
          </p>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="border-border bg-muted/50 text-foreground">
              <SelectValue placeholder={t("styling.selectLanguage")} />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-popover-foreground">
              {LANGUAGES.map((l) => (
                <SelectItem
                  key={l.value}
                  value={l.value}
                  className="focus:bg-accent focus:text-accent-foreground"
                >
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Colors Card */}
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">{t("styling.systemColors")}</h3>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("styling.colorsDesc")}
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
              <div>
                <Label className="text-foreground/70">{t("styling.primaryColor")}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{primaryColor}</p>
              </div>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
              <div>
                <Label className="text-foreground/70">{t("styling.accentColor")}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{accentColor}</p>
              </div>
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Save button */}
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
