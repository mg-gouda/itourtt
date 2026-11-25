"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, Bell, Loader2, Music, Play, Plus, RotateCcw, Search, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";
import { setAlarmSoundUrl, setAlarmSounds } from "@/lib/alarm-sound";

interface Settings {
  alarms: { kind: string; minutes: number; last: boolean; soundUrl?: string | null; soundName?: string | null }[];
  missedAfterMinutes: number;
  warnBeforeMinutes: number;
  recipientRoleIds: string[];
  recipientUserIds: string[];
  soundUrl: string | null;
  soundName: string | null;
}
interface Role { id: string; name: string; slug?: string }
interface User { id: string; name: string; email?: string; role?: string; roleId?: string | null; isActive?: boolean }

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/api\/?$/, "");
const MAX_ALARMS = 5;

/**
 * Company › Alerts (6.5.0). Controls the job start alarms for reps and drivers:
 * how many ring and how long before the job (the last one is answered "On the way",
 * the earlier ones "Seen"), when the office hears about a missed alarm, who in the
 * office is told (users and roles — none picked = admins + Dispatch / Traffic Jobs),
 * and the alarm sound played by the web portals and office popups.
 */
export function JobAlarmSettingsTab() {
  const t = useT();
  const canEdit = usePermission("company.editSettings");
  const [data, setData] = useState<Settings | null>(null);
  const [minutes, setMinutes] = useState<string[]>([]);
  const [missedAfter, setMissedAfter] = useState("5");
  const [warnBefore, setWarnBefore] = useState("45");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [saving, setSaving] = useState(false);
  /** Which sound is uploading: alarm slot number, or "shared". */
  const [uploading, setUploading] = useState<number | "shared" | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const apply = (s: Settings) => {
    setData(s);
    setMinutes(s.alarms.map((a) => String(a.minutes)));
    setMissedAfter(String(s.missedAfterMinutes));
    setWarnBefore(String(s.warnBeforeMinutes));
    setRoleIds(s.recipientRoleIds);
    setUserIds(s.recipientUserIds);
  };

  useEffect(() => {
    api.get("/job-alarm-settings").then(({ data }) => apply(data.data)).catch(() => toast.error(t("alerts.loadFailed")));
    api.get("/permissions/roles").then(({ data }) => setRoles(Array.isArray(data) ? data : data?.data ?? [])).catch(() => setRoles([]));
    api.get("/users?limit=1000").then(({ data }) => setUsers((Array.isArray(data.data) ? data.data : []).filter((u: User) => u.isActive !== false && u.role !== "REP" && u.role !== "DRIVER" && u.role !== "SUPPLIER"))).catch(() => setUsers([]));
  }, [t]);

  const officeRoles = useMemo(() => roles.filter((r) => !["rep", "driver", "supplier"].includes((r.slug ?? "").toLowerCase())), [roles]);
  const shownUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = q ? users.filter((u) => `${u.name} ${u.email ?? ""}`.toLowerCase().includes(q)) : users;
    // Picked users first so they're easy to review.
    return [...list].sort((a, b) => Number(userIds.includes(b.id)) - Number(userIds.includes(a.id)) || a.name.localeCompare(b.name));
  }, [users, userSearch, userIds]);

  if (!data) {
    return (
      <Card className="flex items-center justify-center border-border bg-card p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const nums = minutes.map((m) => Number(m));
  const minutesValid = nums.length >= 1 && nums.every((n) => Number.isInteger(n) && n >= 5 && n <= 360) && new Set(nums).size === nums.length;
  const ordered = [...nums].filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
  const last = ordered[ordered.length - 1];

  const save = async () => {
    if (!minutesValid) {
      toast.error(t("alerts.minutesInvalid"));
      return;
    }
    setSaving(true);
    try {
      const { data: res } = await api.put("/job-alarm-settings", {
        alarmMinutes: nums,
        missedAfterMinutes: Number(missedAfter) || 5,
        warnBeforeMinutes: Math.max(0, Number(warnBefore) || 0),
        recipientRoleIds: roleIds,
        recipientUserIds: userIds,
      });
      apply(res.data);
      toast.success(t("alerts.saved"));
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || t("alerts.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("alerts.soundTooBig"));
      return;
    }
    setUploading(slot ?? "shared");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: res } = await api.post("/job-alarm-settings/sound", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        params: slot != null ? { slot } : undefined,
      });
      apply(res.data);
      setAlarmSoundUrl(res.data.soundUrl);
      setAlarmSounds(res.data.alarms);
      toast.success(t("alerts.soundUploaded"));
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t("alerts.soundFailed"));
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const resetSound = async (which: number | null) => {
    try {
      const { data: res } = await api.delete("/job-alarm-settings/sound", { params: which != null ? { slot: which } : undefined });
      apply(res.data);
      setAlarmSoundUrl(res.data.soundUrl);
      setAlarmSounds(res.data.alarms);
      toast.success(t("alerts.soundReset"));
    } catch {
      toast.error(t("alerts.soundFailed"));
    }
  };

  const playPreview = (url?: string | null) => {
    preview.current?.pause();
    const u = url === undefined ? data.soundUrl : url;
    const src = u ? `${API_ORIGIN}${u}` : "/sounds/job-alarm.wav";
    const a = new Audio(src);
    preview.current = a;
    a.play().catch(() => toast.error(t("alerts.previewFailed")));
    setTimeout(() => a.pause(), 6000);
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) =>
    set(on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return (
    <div className="space-y-6">
      {/* Alarms */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-medium text-foreground">
          <AlarmClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("alerts.alarmsTitle")}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">{t("alerts.alarmsDesc")}</p>

        <div className="space-y-2">
          {minutes.map((m, i) => {
            const n = Number(m);
            const isLast = Number.isFinite(n) && n === last;
            return (
              <div key={i} className="flex flex-wrap items-center gap-3">
                <Label htmlFor={`alarm-min-${i}`} className="w-24 shrink-0 text-sm text-foreground">
                  {t("alerts.alarmN").replace("{n}", String(i + 1))}
                </Label>
                <Input
                  id={`alarm-min-${i}`}
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={360}
                  value={m}
                  disabled={!canEdit}
                  onChange={(e) => setMinutes((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                  className="w-28 border-border bg-muted/50"
                />
                <span className="text-sm text-muted-foreground">{t("alerts.minutesBefore")}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${isLast ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200" : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
                  {isLast ? t("alerts.answerOnTheWay") : t("alerts.answerSeen")}
                </span>
                {canEdit && minutes.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("alerts.removeAlarm").replace("{n}", String(i + 1))}
                    onClick={() => setMinutes((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {canEdit && minutes.length < MAX_ALARMS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setMinutes((list) => [...list, String(Math.max(5, (Math.min(...list.map(Number).filter(Number.isFinite)) || 30) - 15))])}
          >
            <Plus className="h-4 w-4" /> {t("alerts.addAlarm")}
          </Button>
        )}
        {!minutesValid && <p className="mt-2 text-sm text-destructive">{t("alerts.minutesInvalid")}</p>}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="alarm-missed">{t("alerts.missedAfter")}</Label>
            <Input id="alarm-missed" type="number" min={1} max={60} value={missedAfter} disabled={!canEdit}
              onChange={(e) => setMissedAfter(e.target.value)} className="w-28 border-border bg-muted/50" />
            <p className="text-xs text-muted-foreground">{t("alerts.missedAfterDesc")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alarm-warn">{t("alerts.warnBefore")}</Label>
            <Input id="alarm-warn" type="number" min={0} max={240} value={warnBefore} disabled={!canEdit}
              onChange={(e) => setWarnBefore(e.target.value)} className="w-28 border-border bg-muted/50" />
            <p className="text-xs text-muted-foreground">{t("alerts.warnBeforeDesc")}</p>
          </div>
        </div>
      </Card>

      {/* Who in the office is told */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-medium text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("alerts.recipientsTitle")}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">{t("alerts.recipientsDesc")}</p>
        {roleIds.length === 0 && userIds.length === 0 && (
          <p className="mb-4 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm text-foreground">{t("alerts.recipientsDefault")}</p>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">{t("alerts.byRole")}</legend>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {officeRoles.map((r) => (
                <label key={r.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted/50">
                  <Checkbox checked={roleIds.includes(r.id)} disabled={!canEdit} onCheckedChange={(v) => toggle(roleIds, setRoleIds, r.id, v === true)} />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">{t("alerts.byUser")}</legend>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label={t("alerts.searchUsers")} placeholder={t("alerts.searchUsers")} value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)} className="border-border bg-muted/50 ps-8" />
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {shownUsers.map((u) => (
                <label key={u.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted/50">
                  <Checkbox checked={userIds.includes(u.id)} disabled={!canEdit} onCheckedChange={(v) => toggle(userIds, setUserIds, u.id, v === true)} />
                  <span className="flex-1 truncate">{u.name}</span>
                  {u.email && <span className="truncate text-xs text-muted-foreground">{u.email}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      {/* Sounds — one per alarm (6.8.0) */}
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-medium text-foreground">
          <Music className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("alerts.soundTitle")}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">{t("alerts.soundDescPerAlarm")}</p>
        {canEdit && (
          <input ref={fileInput} type="file" accept="audio/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        )}
        <div className="divide-y divide-border rounded-md border border-border">
          {[...data.alarms.map((a, i) => ({ key: a.kind, i, label: t("alerts.soundForAlarm").replace("{n}", String(i + 1)).replace("{m}", String(a.minutes)), own: !!a.soundUrl && a.soundUrl !== data.soundUrl, url: a.soundUrl ?? null, name: a.soundName ?? null })),
            { key: "shared", i: null as number | null, label: t("alerts.soundShared"), own: !!data.soundUrl, url: data.soundUrl, name: data.soundName }]
            .map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="w-44 shrink-0 text-sm font-medium text-foreground">{row.label}</span>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{row.name ?? (row.i != null && data.soundUrl ? t("alerts.soundUsesShared") : t("alerts.soundBuiltIn"))}</span>
              </span>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => playPreview(row.url)}
                aria-label={`${t("alerts.play")} — ${row.label}`}>
                <Play className="h-4 w-4" /> {t("alerts.play")}
              </Button>
              {canEdit && (
                <>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading !== null}
                    onClick={() => { setSlot(row.i); fileInput.current?.click(); }} aria-label={`${t("alerts.uploadSound")} — ${row.label}`}>
                    {uploading === (row.i ?? "shared") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("alerts.uploadSound")}
                  </Button>
                  {row.own && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void resetSound(row.i)}
                      aria-label={`${t("alerts.useBuiltIn")} — ${row.label}`}>
                      <RotateCcw className="h-4 w-4" /> {row.i != null ? t("alerts.soundClear") : t("alerts.useBuiltIn")}
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("alerts.soundAppsNoteLive")}</p>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !minutesValid} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("alerts.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
