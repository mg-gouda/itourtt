"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Pencil, Trash2, FileText, Navigation, PanelBottom } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

interface StaticPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  menuOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

interface FormState {
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  menuOrder: number;
  metaTitle: string;
  metaDescription: string;
}

const emptyForm = (): FormState => ({
  title: "",
  slug: "",
  content: "",
  isPublished: false,
  showInNav: false,
  showInFooter: false,
  menuOrder: 0,
  metaTitle: "",
  metaDescription: "",
});

export default function StaticPagesAdminPage() {
  const [pages, setPages] = useState<StaticPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaticPage | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaticPage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/pages");
      setPages(res.data?.data ?? res.data ?? []);
    } catch {
      toast.error("Failed to load pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditing("new");
    setForm(emptyForm());
  };

  const openEdit = async (page: StaticPage) => {
    setEditing(page);
    // The list omits content/meta — fetch the full record.
    try {
      const res = await api.get(`/admin/pages/${page.id}`);
      const full = res.data?.data ?? res.data;
      setForm({
        title: full.title ?? "",
        slug: full.slug ?? "",
        content: full.content ?? "",
        isPublished: !!full.isPublished,
        showInNav: !!full.showInNav,
        showInFooter: !!full.showInFooter,
        menuOrder: full.menuOrder ?? 0,
        metaTitle: full.metaTitle ?? "",
        metaDescription: full.metaDescription ?? "",
      });
    } catch {
      toast.error("Failed to load page");
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      slug: form.slug || undefined,
      content: form.content || "",
      isPublished: form.isPublished,
      showInNav: form.showInNav,
      showInFooter: form.showInFooter,
      menuOrder: Number.isFinite(form.menuOrder) ? form.menuOrder : 0,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
    };
    try {
      if (editing === "new") {
        await api.post("/admin/pages", payload);
      } else if (editing) {
        await api.put(`/admin/pages/${editing.id}`, payload);
      }
      toast.success("Saved");
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
      await api.delete(`/admin/pages/${deleteTarget.id}`);
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
        title="Pages"
        description="Create static pages (Terms, Privacy, About …) and place them in the website navigation or footer."
        action={{ label: "New page", onClick: openNew }}
      />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-medium">
                    {page.title}
                    <div className="text-xs text-muted-foreground">/{page.slug}</div>
                  </TableCell>
                  <TableCell>
                    {page.isPublished ? (
                      <Badge className="bg-green-100 text-green-700">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {page.showInNav && (
                        <Badge variant="outline" className="gap-1">
                          <Navigation className="h-3 w-3" /> Nav
                        </Badge>
                      )}
                      {page.showInFooter && (
                        <Badge variant="outline" className="gap-1">
                          <PanelBottom className="h-3 w-3" /> Footer
                        </Badge>
                      )}
                      {!page.showInNav && !page.showInFooter && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(page.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(page)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(page)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-6 w-6" />
                    No pages yet. Click “New page” to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New page" : "Edit page"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>URL slug</Label>
                <Input
                  placeholder="auto from title"
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Content</Label>
              <RichTextEditor content={form.content} onChange={(html) => set("content", html)} />
            </div>

            {/* Publishing + menu placement */}
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Visibility & placement</p>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Published</Label>
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(v) => set("isPublished", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Show in navigation menu</Label>
                <Switch
                  checked={form.showInNav}
                  onCheckedChange={(v) => set("showInNav", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Show in footer menu</Label>
                <Switch
                  checked={form.showInFooter}
                  onCheckedChange={(v) => set("showInFooter", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Menu order</Label>
                <Input
                  type="number"
                  className="w-28"
                  value={form.menuOrder}
                  onChange={(e) => set("menuOrder", parseInt(e.target.value, 10) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first in the menus.
                </p>
              </div>
            </div>

            {/* SEO */}
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">SEO</p>
              <div className="space-y-1.5">
                <Label>Meta title</Label>
                <Input
                  maxLength={180}
                  value={form.metaTitle}
                  onChange={(e) => set("metaTitle", e.target.value)}
                  placeholder="Defaults to the page title if empty."
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
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently removed.
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
