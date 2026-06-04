"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Pencil,
  Trash2,
  Newspaper,
  Plus,
  Upload,
  X,
  Tag as TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface Category {
  id: string;
  name: string;
  slug?: string;
}
interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  contentHtml: string | null;
  author: string | null;
  status: string;
  publishedAt: string | null;
  tags: string[];
  categories: Category[];
  updatedAt: string;
}

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string;
  contentHtml: string;
  author: string;
  status: string;
  tags: string;
  categoryIds: string[];
  metaTitle: string;
  metaDescription: string;
}

const emptyForm = (): FormState => ({
  title: "",
  slug: "",
  excerpt: "",
  coverImageUrl: "",
  contentHtml: "",
  author: "",
  status: "DRAFT",
  tags: "",
  categoryIds: [],
  metaTitle: "",
  metaDescription: "",
});

export default function BlogAdminPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlogPost | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [catOpen, setCatOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.get("/blog"),
        api.get("/blog/categories"),
      ]);
      setPosts(pRes.data?.data ?? pRes.data ?? []);
      setCategories(cRes.data?.data ?? cRes.data ?? []);
    } catch {
      toast.error("Failed to load blog");
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

  const openEdit = async (post: BlogPost) => {
    setEditing(post);
    // The list omits contentHtml/meta — fetch the full record.
    try {
      const res = await api.get(`/blog/${post.id}`);
      const full = res.data?.data ?? res.data;
      setForm({
        title: full.title ?? "",
        slug: full.slug ?? "",
        excerpt: full.excerpt ?? "",
        coverImageUrl: full.coverImageUrl ?? "",
        contentHtml: full.contentHtml ?? "",
        author: full.author ?? "",
        status: full.status ?? "DRAFT",
        tags: (full.tags ?? []).join(", "),
        categoryIds: (full.categories ?? []).map((c: Category) => c.id),
        metaTitle: full.metaTitle ?? "",
        metaDescription: full.metaDescription ?? "",
      });
    } catch {
      toast.error("Failed to load post");
    }
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/website-content/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      set("coverImageUrl", (res.data?.data ?? res.data)?.url ?? "");
      toast.success("Cover uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
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
      excerpt: form.excerpt || undefined,
      coverImageUrl: form.coverImageUrl || undefined,
      contentHtml: form.contentHtml || undefined,
      author: form.author || undefined,
      status: form.status,
      tags: form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      categoryIds: form.categoryIds,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
    };
    try {
      if (editing === "new") {
        await api.post("/blog", payload);
      } else if (editing) {
        await api.put(`/blog/${editing.id}`, payload);
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
      await api.delete(`/blog/${deleteTarget.id}`);
      toast.success("Post deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await api.post("/blog/categories", { name: newCategory.trim() });
      setNewCategory("");
      const cRes = await api.get("/blog/categories");
      setCategories(cRes.data?.data ?? cRes.data ?? []);
      toast.success("Category added");
    } catch {
      toast.error("Failed to add category");
    }
  };

  const removeCategory = async (id: string) => {
    try {
      await api.delete(`/blog/categories/${id}`);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const toggleCat = (id: string) =>
    set(
      "categoryIds",
      form.categoryIds.includes(id)
        ? form.categoryIds.filter((c) => c !== id)
        : [...form.categoryIds, id],
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        description="Write and publish blog posts for the B2C website."
        action={{ label: "New post", onClick: openNew }}
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
          <TagIcon className="mr-2 h-4 w-4" /> Manage categories
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium">
                    {post.title}
                    <div className="text-xs text-muted-foreground">/blog/{post.slug}</div>
                  </TableCell>
                  <TableCell>
                    {post.status === "PUBLISHED" ? (
                      <Badge className="bg-green-100 text-green-700">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {post.categories?.map((c) => c.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(post.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(post)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(post)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {posts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Newspaper className="mx-auto mb-2 h-6 w-6" />
                    No posts yet. Click “New post” to write one.
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
            <DialogTitle>{editing === "new" ? "New post" : "Edit post"}</DialogTitle>
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Author</Label>
                <Input value={form.author} onChange={(e) => set("author", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cover */}
            <div className="space-y-1.5">
              <Label>Cover image</Label>
              <div className="flex items-center gap-3">
                {form.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(form.coverImageUrl)}
                    alt="cover"
                    className="h-16 w-28 rounded object-cover"
                  />
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {form.coverImageUrl ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
                  />
                </label>
                {form.coverImageUrl && (
                  <Button variant="ghost" size="sm" onClick={() => set("coverImageUrl", "")}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Excerpt</Label>
              <Textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => set("excerpt", e.target.value)}
                placeholder="Short summary for listing cards."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Content</Label>
              <RichTextEditor content={form.contentHtml} onChange={(html) => set("contentHtml", html)} />
            </div>

            {/* Categories */}
            <div className="space-y-1.5">
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-3 rounded-lg border p-3">
                {categories.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No categories yet — add some via “Manage categories”.
                  </span>
                )}
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.categoryIds.includes(c.id)}
                      onCheckedChange={() => toggleCat(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="airport, hurghada, tips"
              />
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

      {/* Categories manager */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blog categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Input
                placeholder="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
              <Button onClick={addCategory}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded border px-3 py-2">
                  <span className="text-sm">{c.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => removeCategory(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
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
