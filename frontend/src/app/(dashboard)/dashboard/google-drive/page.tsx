"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  ArrowRightCircle,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";

interface GoogleDriveData {
  enabled: boolean;
  serviceAccountJson: string | null;
  rootFolderId: string | null;
}

interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  details: string[];
}

export default function GoogleDrivePage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [rootFolderId, setRootFolderId] = useState("");

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  useEffect(() => {
    api
      .get("/settings/google-drive")
      .then(({ data }: { data: GoogleDriveData }) => {
        setEnabled(data.enabled ?? false);
        setServiceAccountJson(data.serviceAccountJson ?? "");
        setRootFolderId(data.rootFolderId ?? "");
      })
      .catch(() => toast.error(t("googleDrive.saveError")))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await api.patch("/settings/google-drive", {
        enabled,
        serviceAccountJson: serviceAccountJson || undefined,
        rootFolderId: rootFolderId || undefined,
      });
      toast.success(t("googleDrive.saved"));
      setTestResult(null);
    } catch {
      toast.error(t("googleDrive.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/settings/google-drive/test");
      setTestResult(data);
      if (data.ok) {
        toast.success(t("googleDrive.testSuccess"));
      } else {
        toast.error(data.message || t("googleDrive.testFailed"));
      }
    } catch {
      toast.error(t("googleDrive.testError"));
    } finally {
      setTesting(false);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrationResult(null);
    try {
      const { data } = await api.post("/settings/google-drive/migrate");
      setMigrationResult(data);
      if (data.errors === 0) {
        toast.success(t("googleDrive.migrationComplete"));
      } else {
        toast.warning(`${t("googleDrive.migrationComplete")} — ${data.errors} ${t("googleDrive.errors")}`);
      }
    } catch {
      toast.error(t("googleDrive.migrationError"));
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("googleDrive.title")}
        description={t("googleDrive.description")}
      />

      {/* ── Setup Instructions ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-500 shrink-0" />
          <h3 className="font-semibold text-sm">{t("googleDrive.instructions")}</h3>
        </div>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {[
            t("googleDrive.step1"),
            t("googleDrive.step2"),
            t("googleDrive.step3"),
            t("googleDrive.step4"),
            t("googleDrive.step5"),
            t("googleDrive.step6"),
            t("googleDrive.step7"),
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* ── Configuration ── */}
      <Card className="p-5 space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t("googleDrive.enabled")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              {t("googleDrive.enabledDesc")}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <hr className="border-border" />

        {/* Service Account JSON */}
        <div className="space-y-1.5">
          <Label htmlFor="sa-json">{t("googleDrive.serviceAccountJson")}</Label>
          <Textarea
            id="sa-json"
            rows={8}
            className="font-mono text-xs"
            placeholder={t("googleDrive.serviceAccountJsonPlaceholder")}
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("googleDrive.serviceAccountJsonDesc")}</p>
        </div>

        {/* Root Folder ID */}
        <div className="space-y-1.5">
          <Label htmlFor="folder-id">{t("googleDrive.rootFolderId")}</Label>
          <Input
            id="folder-id"
            placeholder={t("googleDrive.rootFolderIdPlaceholder")}
            value={rootFolderId}
            onChange={(e) => setRootFolderId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("googleDrive.rootFolderIdDesc")}</p>
        </div>

        {/* Save + Test buttons */}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("googleDrive.save")}
          </Button>

          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArrowRightCircle className="h-4 w-4 mr-2" />
            )}
            {t("googleDrive.testConnection")}
          </Button>
        </div>

        {/* Test result inline */}
        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-md p-3 text-sm ${
              testResult.ok
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </Card>

      {/* ── Migration ── */}
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm mb-1">{t("googleDrive.migration")}</h3>
          <p className="text-sm text-muted-foreground">{t("googleDrive.migrationDesc")}</p>
        </div>

        <Button
          variant="outline"
          onClick={handleMigrate}
          disabled={migrating}
          className="w-full sm:w-auto"
        >
          {migrating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {migrating ? t("googleDrive.migrating") : t("googleDrive.runMigration")}
        </Button>

        {migrationResult && (
          <div className="space-y-3">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {t("googleDrive.total")}: {migrationResult.total}
              </Badge>
              <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0">
                {t("googleDrive.migrated")}: {migrationResult.migrated}
              </Badge>
              <Badge variant="secondary">
                {t("googleDrive.skipped")}: {migrationResult.skipped}
              </Badge>
              {migrationResult.errors > 0 && (
                <Badge variant="destructive">
                  {t("googleDrive.errors")}: {migrationResult.errors}
                </Badge>
              )}
            </div>

            {/* Detail log */}
            {migrationResult.details.length > 0 && (
              <div className="rounded-md bg-muted p-3 max-h-64 overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {migrationResult.details.join("\n")}
                </pre>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
