"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Loader2, Send, Upload, Paperclip, X } from "lucide-react";

const TEMPLATE_VARIABLES = [
  "clientName",
  "serviceDate",
  "pickupTime",
  "origin",
  "destination",
  "serviceType",
  "internalRef",
  "agentRef",
  "repName",
  "repNumber",
  "driverName",
  "driverNumber",
  "paxCount",
  "clientSign",
];

const SAMPLE_DATA: Record<string, string> = {
  clientName: "John Smith",
  serviceDate: "2025-03-15",
  pickupTime: "08:30 AM",
  origin: "Cairo Airport T2",
  destination: "Four Seasons Hotel",
  serviceType: "ARR",
  internalRef: "TJ-2025-0042",
  agentRef: "AGT-7890",
  repName: "Ahmed Hassan",
  repNumber: "+201012345678",
  driverName: "Mohamed Ali",
  driverNumber: "+201098765432",
  paxCount: "3",
  clientSign: "(attached below)",
};

interface LogEntry {
  id: string;
  trafficJobId: string;
  recipientPhone: string;
  messageSid: string | null;
  status: "SENT" | "FAILED";
  errorMessage: string | null;
  sentAt: string;
  trafficJob: { internalRef: string };
}

export default function WhatsAppPage() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Settings state
  const [isEnabled, setIsEnabled] = useState(false);
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [whatsappFrom, setWhatsappFrom] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [sendHour, setSendHour] = useState("9");

  // Test message
  const [testPhone, setTestPhone] = useState("");

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, []);

  async function loadSettings() {
    try {
      const { data } = await api.get("/whatsapp-notifications/settings");
      setIsEnabled(data.isEnabled ?? false);
      setTwilioAccountSid(data.twilioAccountSid ?? "");
      setTwilioAuthToken(data.twilioAuthToken ?? "");
      setWhatsappFrom(data.whatsappFrom ?? "");
      setMessageTemplate(
        data.messageTemplate ??
          "Hello {{clientName}}, this is a reminder for your {{serviceType}} service on {{serviceDate}} at {{pickupTime}}. Ref: {{internalRef}}. Pax: {{paxCount}}. From: {{origin}} To: {{destination}}."
      );
      setMediaUrl(data.mediaUrl ?? "");
      setSendHour(String(data.sendHour ?? 9));
    } catch {
      // defaults are fine
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    try {
      const { data } = await api.get("/whatsapp-notifications/logs?limit=20");
      setLogs(data.logs ?? []);
      setLogsTotal(data.total ?? 0);
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      const { data } = await api.patch("/whatsapp-notifications/settings", {
        isEnabled,
        twilioAccountSid,
        ...(twilioAuthToken && !twilioAuthToken.startsWith("****")
          ? { twilioAuthToken }
          : {}),
        whatsappFrom,
        messageTemplate,
        mediaUrl: mediaUrl || null,
        sendHour: parseInt(sendHour, 10),
      });
      setTwilioAuthToken(data.twilioAuthToken ?? "");
      setMediaUrl(data.mediaUrl ?? "");
      toast.success(t("whatsapp.settingsSaved"));
    } catch {
      toast.error(t("whatsapp.failedSave"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestSend() {
    if (!testPhone.trim()) return;
    setTestSending(true);
    try {
      await api.post("/whatsapp-notifications/test", { phone: testPhone });
      toast.success(t("whatsapp.testSent"));
      loadLogs();
    } catch {
      toast.error(t("whatsapp.testFailed"));
    } finally {
      setTestSending(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post(
        "/whatsapp-notifications/upload-media",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setMediaUrl(data.url);
      toast.success(t("whatsapp.fileUploaded"));
    } catch {
      toast.error(t("whatsapp.fileUploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function renderPreview() {
    let preview = messageTemplate;
    for (const key of TEMPLATE_VARIABLES) {
      preview = preview.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        SAMPLE_DATA[key] ?? key
      );
    }
    return preview;
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
        title={t("whatsapp.title")}
        description={t("whatsapp.description")}
      />

      {/* Card 1 — Twilio Configuration */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("whatsapp.twilioConfig")}
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              id="wa-enabled"
            />
            <Label htmlFor="wa-enabled" className="text-foreground/70">
              {t("whatsapp.enableNotifications")}
            </Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-foreground/70">
                {t("whatsapp.accountSid")}
              </Label>
              <Input
                value={twilioAccountSid}
                onChange={(e) => setTwilioAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
            <div>
              <Label className="text-foreground/70">
                {t("whatsapp.authToken")}
              </Label>
              <Input
                type="password"
                value={twilioAuthToken}
                onChange={(e) => setTwilioAuthToken(e.target.value)}
                placeholder="••••••••"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-foreground/70">
                {t("whatsapp.fromNumber")}
              </Label>
              <Input
                value={whatsappFrom}
                onChange={(e) => setWhatsappFrom(e.target.value)}
                placeholder="+14155238886"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
            <div>
              <Label className="text-foreground/70">
                {t("whatsapp.sendHour")}
              </Label>
              <Select value={sendHour} onValueChange={setSendHour}>
                <SelectTrigger className="border-border bg-muted/50 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}:00 (Cairo)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* Card 2 — Message Template */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("whatsapp.messageTemplate")}
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-foreground/70">
              {t("whatsapp.templateBody")}
            </Label>
            <Textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
              className="border-border bg-muted/50 text-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="cursor-pointer text-xs"
                onClick={() =>
                  setMessageTemplate((prev) => prev + `{{${v}}}`)
                }
              >
                {"{{" + v + "}}"}
              </Badge>
            ))}
          </div>
          <div>
            <Label className="text-foreground/70">
              {t("whatsapp.livePreview")}
            </Label>
            <div className="mt-1 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground/80 whitespace-pre-wrap">
              {renderPreview()}
            </div>
          </div>
        </div>
      </Card>

      {/* Card 3 — File Attachment */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("whatsapp.fileAttachment")}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("whatsapp.fileAttachmentDesc")}
        </p>
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-foreground/70">
                {t("whatsapp.mediaUrl")}
              </Label>
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/file.pdf"
                className="border-border bg-muted/50 text-foreground"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("whatsapp.uploadFile")}
            </Button>
          </div>
          {mediaUrl && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-foreground/80">
                {mediaUrl}
              </span>
              <button
                onClick={() => setMediaUrl("")}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Card 4 — Test Message */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("whatsapp.testMessage")}
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-foreground/70">
              {t("whatsapp.recipientPhone")}
            </Label>
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+201234567890"
              className="border-border bg-muted/50 text-foreground"
            />
          </div>
          <Button
            onClick={handleTestSend}
            disabled={testSending || !testPhone.trim()}
            size="sm"
            className="gap-1.5"
          >
            {testSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("whatsapp.sendTest")}
          </Button>
        </div>
      </Card>

      {/* Card 5 — Recent Logs */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("whatsapp.recentLogs")}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({logsTotal})
          </span>
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("whatsapp.noLogs")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("whatsapp.jobRef")}</TableHead>
                  <TableHead>{t("whatsapp.recipient")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("whatsapp.sentAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {log.trafficJob?.internalRef ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.recipientPhone}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.status === "SENT" ? "default" : "destructive"
                        }
                        className="text-xs"
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.sentAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
