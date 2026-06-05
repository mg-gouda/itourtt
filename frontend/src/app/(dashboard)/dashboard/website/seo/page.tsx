"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Save, Search, Languages } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TranslationsPanel,
  type TransFieldDef,
} from "@/components/website/translations-panel";
import api from "@/lib/api";

const SEO_TRANS_FIELDS: TransFieldDef[] = [
  { key: "metaTitle", label: "Meta title", type: "text" },
  { key: "metaDescription", label: "Meta description", type: "textarea" },
];

interface PageSeoRow {
  pageKey: string;
  label: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export default function PageSeoAdminPage() {
  const [rows, setRows] = useState<PageSeoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [transRow, setTransRow] = useState<PageSeoRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/page-seo");
      setRows(res.data?.data ?? res.data ?? []);
    } catch {
      toast.error("Failed to load page SEO settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: string, field: "metaTitle" | "metaDescription", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.pageKey === key ? { ...r, [field]: value } : r)),
    );
  };

  const save = async (row: PageSeoRow) => {
    setSavingKey(row.pageKey);
    try {
      await api.put(`/page-seo/${row.pageKey}`, {
        metaTitle: row.metaTitle || undefined,
        metaDescription: row.metaDescription || undefined,
      });
      toast.success(`Saved “${row.label}” SEO`);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Page SEO"
        description="Meta title & description for each B2C website page. Leave blank to use the site defaults."
      />

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <Card key={row.pageKey}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  {row.label}
                  <code className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    {row.pageKey}
                  </code>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Meta Title</Label>
                  <Input
                    maxLength={180}
                    placeholder="e.g. Hurghada Airport Transfers | iTour"
                    value={row.metaTitle ?? ""}
                    onChange={(e) => setField(row.pageKey, "metaTitle", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {(row.metaTitle ?? "").length}/180 — aim for 50–60 characters.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Meta Description</Label>
                  <Textarea
                    maxLength={320}
                    rows={2}
                    placeholder="Short summary shown in search results."
                    value={row.metaDescription ?? ""}
                    onChange={(e) => setField(row.pageKey, "metaDescription", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {(row.metaDescription ?? "").length}/320 — aim for 150–160 characters.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTransRow(row)}>
                    <Languages className="mr-2 h-4 w-4" />
                    Translations
                  </Button>
                  <Button size="sm" onClick={() => save(row)} disabled={savingKey === row.pageKey}>
                    {savingKey === row.pageKey ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!transRow} onOpenChange={(o) => !o && setTransRow(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5" />
              {transRow?.label} — Translations
            </DialogTitle>
          </DialogHeader>
          {transRow && (
            <TranslationsPanel
              entity="page_seo"
              id={transRow.pageKey}
              fields={SEO_TRANS_FIELDS}
              englishSource={{
                metaTitle: transRow.metaTitle ?? "",
                metaDescription: transRow.metaDescription ?? "",
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
