"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";

interface EmailSettingsData {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  notifyDispatchEmail: string;
  notifyTrafficEmail: string;
}

export default function EmailSettingsPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [notifyDispatchEmail, setNotifyDispatchEmail] = useState("");
  const [notifyTrafficEmail, setNotifyTrafficEmail] = useState("");

  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    api
      .get("/settings/email")
      .then(({ data }: { data: EmailSettingsData }) => {
        setSmtpHost(data.smtpHost ?? "");
        setSmtpPort(String(data.smtpPort ?? 587));
        setSmtpSecure(data.smtpSecure ?? false);
        setSmtpUser(data.smtpUser ?? "");
        setSmtpPass(data.smtpPass ?? "");
        setFromAddress(data.fromAddress ?? "");
        setNotifyDispatchEmail(data.notifyDispatchEmail ?? "");
        setNotifyTrafficEmail(data.notifyTrafficEmail ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSubmitting(true);
    try {
      await api.patch("/settings/email", {
        smtpHost: smtpHost || undefined,
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpSecure,
        smtpUser: smtpUser || undefined,
        ...(smtpPass && !smtpPass.startsWith("••") ? { smtpPass } : {}),
        fromAddress: fromAddress || undefined,
        notifyDispatchEmail: notifyDispatchEmail || undefined,
        notifyTrafficEmail: notifyTrafficEmail || undefined,
      });
      toast.success(t("emailSettings.settingsSaved"));
    } catch {
      toast.error(t("emailSettings.failedSave"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestEmail() {
    if (!testEmail.trim()) return;
    setTesting(true);
    try {
      await api.post("/settings/email/test", { email: testEmail });
      toast.success(t("emailSettings.testSent"));
    } catch {
      toast.error(t("emailSettings.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("emailSettings.title")}
        description={t("emailSettings.description")}
      />

      {/* SMTP Configuration */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("emailSettings.smtpConfig")}
        </h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-foreground/70">
                {t("emailSettings.smtpHost")}
              </Label>
              <Input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">
                {t("emailSettings.smtpPort")}
              </Label>
              <Input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-foreground/70">
                {t("emailSettings.smtpUser")}
              </Label>
              <Input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="user@gmail.com"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">
                {t("emailSettings.smtpPass")}
              </Label>
              <Input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="••••••••"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-foreground/70">
                {t("emailSettings.fromAddress")}
              </Label>
              <Input
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="noreply@yourcompany.com"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={smtpSecure}
                onCheckedChange={setSmtpSecure}
                id="smtp-secure"
              />
              <Label htmlFor="smtp-secure" className="text-foreground/70">
                {t("emailSettings.smtpSecure")}
              </Label>
            </div>
          </div>
        </div>
      </Card>

      {/* Notification Emails */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("emailSettings.notificationEmails")}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("emailSettings.notificationEmailsDesc")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-foreground/70">
              {t("emailSettings.dispatchEmail")}
            </Label>
            <Input
              type="email"
              value={notifyDispatchEmail}
              onChange={(e) => setNotifyDispatchEmail(e.target.value)}
              placeholder="dispatch@yourcompany.com"
              className="border-border bg-muted/50 text-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">
              {t("emailSettings.trafficEmail")}
            </Label>
            <Input
              type="email"
              value={notifyTrafficEmail}
              onChange={(e) => setNotifyTrafficEmail(e.target.value)}
              placeholder="traffic@yourcompany.com"
              className="border-border bg-muted/50 text-foreground"
            />
          </div>
        </div>
      </Card>

      {/* Test Email */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("emailSettings.testEmail")}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("emailSettings.testEmailDesc")}
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-foreground/70">
              {t("emailSettings.recipientEmail")}
            </Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="border-border bg-muted/50 text-foreground"
            />
          </div>
          <Button
            onClick={handleTestEmail}
            disabled={testing || !testEmail.trim()}
            size="sm"
            className="gap-1.5"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("emailSettings.sendTest")}
          </Button>
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
