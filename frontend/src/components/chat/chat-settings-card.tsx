"use client";

import { useEffect, useState } from "react";
import { Building2, Car, Loader2, MessageCircle, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";

interface ChatSettings {
  driverContactRoles: string[];
  repContactRoles: string[];
  staffContactRoles: string[];
  availableRoles: { slug: string; name: string }[];
}

/**
 * Company page: which staff roles drivers and reps can message. Saved on its
 * own (PATCH /chat/settings) and applied immediately.
 */
export function ChatSettingsCard() {
  const t = useT();
  const canEdit = usePermission("company.editSettings");
  const [data, setData] = useState<ChatSettings | null>(null);
  const [driver, setDriver] = useState<string[]>([]);
  const [rep, setRep] = useState<string[]>([]);
  const [staff, setStaff] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/chat/settings")
      .then(({ data }) => {
        setData(data.data);
        setDriver(data.data.driverContactRoles);
        setRep(data.data.repContactRoles);
        setStaff(data.data.staffContactRoles ?? []);
      })
      .catch(() => toast.error(t("chat.settingsLoadFailed")));
  }, [t]);

  if (!data) {
    return (
      <Card className="flex items-center justify-center border-border bg-card p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const dirty = !same(driver, data.driverContactRoles) || !same(rep, data.repContactRoles) || !same(staff, data.staffContactRoles ?? []);
  const toggle = (list: string[], set: (v: string[]) => void, slug: string, on: boolean) =>
    set(on ? [...list, slug] : list.filter((s) => s !== slug));

  const save = async () => {
    setSaving(true);
    try {
      const { data: res } = await api.patch("/chat/settings", {
        driverContactRoles: driver,
        repContactRoles: rep,
        staffContactRoles: staff,
      });
      setData(res.data);
      setDriver(res.data.driverContactRoles);
      setRep(res.data.repContactRoles);
      setStaff(res.data.staffContactRoles ?? []);
      toast.success(t("chat.settingsSaved"));
    } catch {
      toast.error(t("chat.settingsSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const column = (title: string, Icon: typeof Car, list: string[], set: (v: string[]) => void, id: string) => (
    <fieldset className="space-y-2">
      <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium text-foreground/80">
        <Icon className="h-4 w-4" />
        {title}
      </legend>
      {data.availableRoles.map((r) => (
        <label key={r.slug} htmlFor={`${id}-${r.slug}`} className="flex items-center gap-2 text-sm">
          <Checkbox
            id={`${id}-${r.slug}`}
            checked={list.includes(r.slug)}
            onCheckedChange={(v) => toggle(list, set, r.slug, v === true)}
            disabled={!canEdit || saving}
          />
          {r.name}
        </label>
      ))}
    </fieldset>
  );

  return (
    <Card className="border-border bg-card p-6">
      <h3 className="mb-1 flex items-center gap-2 text-base font-medium text-foreground">
        <MessageCircle className="h-4 w-4" />
        {t("chat.settingsTitle")}
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">{t("chat.settingsDesc")}</p>
      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
        {column(t("chat.driversCanMessage"), Car, driver, setDriver, "chat-drv")}
        {column(t("chat.repsCanMessage"), UserCheck, rep, setRep, "chat-rep")}
        {column(t("chat.staffCanMessage"), Building2, staff, setStaff, "chat-staff")}
      </div>
      {canEdit && (
        <Button className="mt-4" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("chat.settingsSave")}
        </Button>
      )}
    </Card>
  );
}
