"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Pencil,
  Trash2,
  MapPin,
  Plus,
  X,
  Upload,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import api from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const assetUrl = (url?: string | null) =>
  url && url.startsWith("/uploads/") ? `${API_BASE}${url}` : url ?? "";

interface BodySection {
  heading?: string;
  body?: string;
}
interface FaqItem {
  question?: string;
  answer?: string;
}
interface CityPage {
  slug: string;
  isPublished: boolean;
  showInMenu: boolean;
  menuOrder: number;
  heroHeadline: string | null;
  heroImageUrl: string | null;
  introText: string | null;
  contentHtml: string | null;
  bodyJson: BodySection[] | null;
  faqJson: FaqItem[] | null;
  metaTitle: string | null;
  metaDescription: string | null;
}
interface CityRow {
  cityId: string;
  cityName: string;
  airportName: string | null;
  page: CityPage | null;
}

interface FormState {
  slug: string;
  isPublished: boolean;
  showInMenu: boolean;
  menuOrder: number;
  heroHeadline: string;
  heroImageUrl: string;
  introText: string;
  contentHtml: string;
  bodyJson: BodySection[];
  faqJson: FaqItem[];
  metaTitle: string;
  metaDescription: string;
}

const emptyForm = (): FormState => ({
  slug: "",
  isPublished: false,
  showInMenu: true,
  menuOrder: 0,
  heroHeadline: "",
  heroImageUrl: "",
  introText: "",
  contentHtml: "",
  bodyJson: [],
  faqJson: [],
  metaTitle: "",
  metaDescription: "",
});

export default function DestinationsAdminPage() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CityRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CityRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/city-pages");
      setRows(res.data?.data ?? res.data ?? []);
    } catch {
      toast.error("Failed to load city pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (row: CityRow) => {
    setEditing(row);
    const p = row.page;
    setForm(
      p
        ? {
            slug: p.slug ?? "",
            isPublished: p.isPublished,
            showInMenu: p.showInMenu,
            menuOrder: p.menuOrder ?? 0,
            heroHeadline: p.heroHeadline ?? "",
            heroImageUrl: p.heroImageUrl ?? "",
            introText: p.introText ?? "",
            contentHtml: p.contentHtml ?? "",
            bodyJson: p.bodyJson ?? [],
            faqJson: p.faqJson ?? [],
            metaTitle: p.metaTitle ?? "",
            metaDescription: p.metaDescription ?? "",
          }
        : emptyForm(),
    );
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const uploadHero = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/website-content/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      set("heroImageUrl", (res.data?.data ?? res.data)?.url ?? "");
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/city-pages/${editing.cityId}`, {
        ...form,
        bodyJson: form.bodyJson.filter((b) => b.heading || b.body),
        faqJson: form.faqJson.filter((f) => f.question || f.answer),
      });
      toast.success(`Saved “${editing.cityName}”`);
      setEditing(null);
      load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/city-pages/${deleteTarget.cityId}`);
      toast.success("Page deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destinations / Cities"
        description="Create a landing page for each city. Published pages with “Show in menu” appear in the Destinations mega-menu on the website."
      />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City</TableHead>
                <TableHead>Airport</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In menu</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.cityId}>
                  <TableCell className="font-medium">{row.cityName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.airportName ?? "—"}</TableCell>
                  <TableCell>
                    {row.page ? (
                      <code className="text-xs">/transfers/{row.page.slug}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!row.page ? (
                      <Badge variant="outline">No page</Badge>
                    ) : row.page.isPublished ? (
                      <Badge className="bg-green-100 text-green-700">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.page?.showInMenu && row.page?.isPublished ? "Yes" : "No"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                      <Pencil className="mr-1 h-4 w-4" />
                      {row.page ? "Edit" : "Create"}
                    </Button>
                    {row.page && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <MapPin className="mx-auto mb-2 h-6 w-6" />
                    No cities found. Add cities under Locations first.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {editing?.cityName} — Landing Page
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Publish controls */}
            <div className="flex flex-wrap items-center gap-6 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.isPublished} onCheckedChange={(v) => set("isPublished", v)} />
                <Label>Published</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.showInMenu} onCheckedChange={(v) => set("showInMenu", v)} />
                <Label>Show in menu</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">Menu order</Label>
                <Input
                  type="number"
                  className="w-20"
                  value={form.menuOrder}
                  onChange={(e) => set("menuOrder", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>URL slug</Label>
                <Input
                  placeholder="auto from city name"
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hero headline</Label>
                <Input
                  value={form.heroHeadline}
                  onChange={(e) => set("heroHeadline", e.target.value)}
                  placeholder="e.g. Private Transfers in Hurghada"
                />
              </div>
            </div>

            {/* Hero image */}
            <div className="space-y-1.5">
              <Label>Hero image</Label>
              <div className="flex items-center gap-3">
                {form.heroImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(form.heroImageUrl)}
                    alt="hero"
                    className="h-16 w-28 rounded object-cover"
                  />
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {form.heroImageUrl ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadHero(e.target.files[0])}
                  />
                </label>
                {form.heroImageUrl && (
                  <Button variant="ghost" size="sm" onClick={() => set("heroImageUrl", "")}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Intro text</Label>
              <Textarea
                rows={3}
                value={form.introText}
                onChange={(e) => set("introText", e.target.value)}
                placeholder="Short introduction shown under the hero."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Page content (rich / HTML)</Label>
              <RichTextEditor
                content={form.contentHtml}
                onChange={(html) => set("contentHtml", html)}
                placeholder="<p>Write the page body. Use the < > button to paste raw HTML.</p>"
              />
              <p className="text-xs text-muted-foreground">
                Formatted content shown below the intro. Click the{" "}
                <span className="font-mono">&lt;&gt;</span> button to paste raw HTML.
              </p>
            </div>

            {/* Body sections */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Body sections</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => set("bodyJson", [...form.bodyJson, { heading: "", body: "" }])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add section
                </Button>
              </div>
              {form.bodyJson.map((sec, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Section heading"
                      value={sec.heading ?? ""}
                      onChange={(e) => {
                        const next = [...form.bodyJson];
                        next[i] = { ...next[i], heading: e.target.value };
                        set("bodyJson", next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => set("bodyJson", form.bodyJson.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    placeholder="Section body"
                    value={sec.body ?? ""}
                    onChange={(e) => {
                      const next = [...form.bodyJson];
                      next[i] = { ...next[i], body: e.target.value };
                      set("bodyJson", next);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>FAQ</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => set("faqJson", [...form.faqJson, { question: "", answer: "" }])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add question
                </Button>
              </div>
              {form.faqJson.map((f, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Question"
                      value={f.question ?? ""}
                      onChange={(e) => {
                        const next = [...form.faqJson];
                        next[i] = { ...next[i], question: e.target.value };
                        set("faqJson", next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => set("faqJson", form.faqJson.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Answer"
                    value={f.answer ?? ""}
                    onChange={(e) => {
                      const next = [...form.faqJson];
                      next[i] = { ...next[i], answer: e.target.value };
                      set("faqJson", next);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* SEO */}
            <div className="space-y-3 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ExternalLink className="h-4 w-4" /> SEO
              </p>
              <div className="space-y-1.5">
                <Label>Meta title</Label>
                <Input
                  maxLength={180}
                  value={form.metaTitle}
                  onChange={(e) => set("metaTitle", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Meta description</Label>
                <Textarea
                  maxLength={320}
                  rows={2}
                  value={form.metaDescription}
                  onChange={(e) => set("metaDescription", e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete landing page?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the CMS page for “{deleteTarget?.cityName}”. The city itself is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
