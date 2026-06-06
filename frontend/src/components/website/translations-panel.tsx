"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Save, Trash2, Languages, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";

export type TranslatableEntity =
  | "city_page"
  | "blog_post"
  | "page_seo"
  | "static_page";
type FieldType = "text" | "textarea" | "html" | "faq";

export interface TransFieldDef {
  key: string;
  label: string;
  type: FieldType;
}

interface FaqItem {
  question?: string;
  answer?: string;
}

export const TRANSLATION_LOCALES: { code: string; label: string }[] = [
  { code: "ar", label: "العربية · Arabic" },
  { code: "de", label: "Deutsch · German" },
  { code: "fr", label: "Français · French" },
  { code: "it", label: "Italiano · Italian" },
  { code: "nl", label: "Nederlands · Dutch" },
  { code: "ru", label: "Русский · Russian" },
];

const BASE_PATH: Record<TranslatableEntity, string> = {
  city_page: "city-pages",
  blog_post: "blog",
  page_seo: "page-seo",
  static_page: "admin/pages",
};

type Draft = Record<string, unknown>;

interface Props {
  entity: TranslatableEntity;
  /** Identifier for the entity: cityId | blog post id | pageKey. */
  id: string;
  fields: TransFieldDef[];
  /** Current English values, shown read-only beside each translation field. */
  englishSource: Record<string, unknown>;
}

export function TranslationsPanel({ entity, id, fields, englishSource }: Props) {
  const base = `/${BASE_PATH[entity]}/${id}/translations`;
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState<string>(TRANSLATION_LOCALES[0].code);
  const [draft, setDraft] = useState<Draft>({});
  const [savingLocale, setSavingLocale] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [bulk, setBulk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(base);
      const map = (res.data?.data ?? res.data)?.translations ?? {};
      setSaved(map);
    } catch {
      toast.error("Failed to load translations");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  // Load the draft for the active locale whenever it (or the saved map) changes.
  useEffect(() => {
    const row = saved[active] ?? {};
    const next: Draft = {};
    for (const f of fields) {
      next[f.key] = row[f.key] ?? (f.type === "faq" ? [] : "");
    }
    setDraft(next);
  }, [active, saved, fields]);

  const setField = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const buildPayload = (d: Draft) => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = d[f.key];
      if (f.type === "faq") {
        const arr = (Array.isArray(v) ? v : []).filter(
          (x: FaqItem) => x.question || x.answer,
        );
        payload[f.key] = arr.length ? arr : undefined;
      } else {
        payload[f.key] = v ? String(v) : undefined;
      }
    }
    return payload;
  };

  const saveLocale = async (locale: string, d: Draft) => {
    await api.put(`${base}/${locale}`, buildPayload(d));
  };

  const handleSave = async () => {
    setSavingLocale(active);
    try {
      await saveLocale(active, draft);
      setSaved((s) => ({ ...s, [active]: { ...draft } }));
      toast.success(`Saved ${active.toUpperCase()} translation`);
    } catch {
      toast.error("Failed to save translation");
    } finally {
      setSavingLocale(null);
    }
  };

  const handleDelete = async () => {
    setSavingLocale(active);
    try {
      await api.delete(`${base}/${active}`);
      setSaved((s) => {
        const next = { ...s };
        delete next[active];
        return next;
      });
      toast.success(`Deleted ${active.toUpperCase()} translation`);
    } catch {
      toast.error("Failed to delete translation");
    } finally {
      setSavingLocale(null);
    }
  };

  const autoTranslate = async () => {
    setTranslating(true);
    try {
      const res = await api.post(`/translate`, {
        entity,
        id,
        locale: active,
        save: false,
      });
      const tr = (res.data?.data ?? res.data)?.translation ?? {};
      setDraft((d) => {
        const next = { ...d };
        for (const f of fields) {
          if (tr[f.key] !== undefined && tr[f.key] !== null) next[f.key] = tr[f.key];
        }
        return next;
      });
      toast.success(`Auto-translated to ${active.toUpperCase()} — review & save`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      toast.error(msg || "Auto-translate failed");
    } finally {
      setTranslating(false);
    }
  };

  const autoTranslateAll = async () => {
    setBulk(true);
    let ok = 0;
    try {
      for (const { code } of TRANSLATION_LOCALES) {
        try {
          await api.post(`/translate`, { entity, id, locale: code, save: true });
          ok += 1;
        } catch {
          toast.error(`Failed for ${code.toUpperCase()}`);
        }
      }
      await load();
      toast.success(`Auto-translated & saved ${ok}/${TRANSLATION_LOCALES.length} locales`);
    } finally {
      setBulk(false);
    }
  };

  const renderEnglish = (f: TransFieldDef) => {
    const v = englishSource[f.key];
    if (f.type === "faq") {
      const arr = (Array.isArray(v) ? v : []) as FaqItem[];
      if (!arr.length) return <p className="text-xs text-muted-foreground">— no English FAQ —</p>;
      return (
        <div className="space-y-1">
          {arr.map((x, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <span className="font-medium">Q:</span> {x.question}
              <br />
              <span className="font-medium">A:</span> {x.answer}
            </p>
          ))}
        </div>
      );
    }
    return (
      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {v ? String(v) : "— empty —"}
      </p>
    );
  };

  const renderInput = (f: TransFieldDef) => {
    if (f.type === "faq") {
      const arr = (Array.isArray(draft[f.key]) ? draft[f.key] : []) as FaqItem[];
      const enArr = (Array.isArray(englishSource[f.key])
        ? englishSource[f.key]
        : []) as FaqItem[];
      return (
        <div className="space-y-2">
          {arr.map((item, i) => (
            <div key={i} className="space-y-1 rounded border p-2">
              <Input
                placeholder={enArr[i]?.question || "Question"}
                value={item.question ?? ""}
                onChange={(e) => {
                  const next = [...arr];
                  next[i] = { ...next[i], question: e.target.value };
                  setField(f.key, next);
                }}
              />
              <Textarea
                rows={2}
                placeholder={enArr[i]?.answer || "Answer"}
                value={item.answer ?? ""}
                onChange={(e) => {
                  const next = [...arr];
                  next[i] = { ...next[i], answer: e.target.value };
                  setField(f.key, next);
                }}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setField(f.key, [...arr, { question: "", answer: "" }])}
          >
            Add Q/A
          </Button>
        </div>
      );
    }
    if (f.type === "text") {
      return (
        <Input
          value={(draft[f.key] as string) ?? ""}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      );
    }
    // textarea + html (raw HTML edited as text to preserve tags)
    return (
      <Textarea
        rows={f.type === "html" ? 6 : 2}
        className={f.type === "html" ? "font-mono text-xs" : ""}
        value={(draft[f.key] as string) ?? ""}
        onChange={(e) => setField(f.key, e.target.value)}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading translations…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Languages className="h-4 w-4" /> Translations
        </p>
        <Button variant="outline" size="sm" onClick={autoTranslateAll} disabled={bulk}>
          {bulk ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Auto-translate all locales
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Save the English content first — auto-translate reads the saved English version.
        Machine translations are drafts; review before saving.
      </p>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="flex flex-wrap">
          {TRANSLATION_LOCALES.map((l) => (
            <TabsTrigger key={l.code} value={l.code} className="gap-1">
              {l.code.toUpperCase()}
              {saved[l.code] ? <Check className="h-3 w-3 text-green-600" /> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={saved[active] ? "default" : "outline"}>
          {saved[active] ? "Translated" : "Not translated"}
        </Badge>
        <Button variant="outline" size="sm" onClick={autoTranslate} disabled={translating}>
          {translating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Auto-translate from English
        </Button>
      </div>

      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.key} className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">
                {f.label} · English
              </Label>
              <div className="rounded border bg-muted/40 p-2">{renderEnglish(f)}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase">
                {f.label} · {active.toUpperCase()}
              </Label>
              {renderInput(f)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        {saved[active] && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={handleDelete}
            disabled={savingLocale === active}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={savingLocale === active}>
          {savingLocale === active ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save {active.toUpperCase()} translation
        </Button>
      </div>
    </div>
  );
}
