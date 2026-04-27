"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contentPageSchema } from "@/lib/validation";
import {
  createContent,
  updateContent,
  togglePublishStatus,
} from "@/actions/content";
import { listAllContent } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { SessionWithRole, ContentInput } from "@/types";

type ContentRow = {
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
};

export default function AdminContentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const typedSession = session as unknown as SessionWithRole | null;

  const [pages, setPages] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const form = useForm<ContentInput>({
    resolver: zodResolver(contentPageSchema),
    defaultValues: { slug: "", title: "", body: "", published: false },
  });

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAllContent();
      setPages(data as ContentRow[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated" && typedSession?.user?.role !== "ADMIN") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const data = await listAllContent();
          if (!cancelled) setPages(data as ContentRow[]);
        } catch {
          // silently fail
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }
  }, [status, typedSession, router]);

  function openCreateDialog() {
    setEditingId(null);
    setFormError("");
    form.reset({ slug: "", title: "", body: "", published: false });
    setFormOpen(true);
  }

  function openEditDialog(page: ContentRow) {
    setEditingId(page.id);
    setFormError("");
    form.reset({
      slug: page.slug,
      title: page.title,
      body: page.body,
      published: page.published,
    });
    setFormOpen(true);
  }

  async function onSubmit(data: ContentInput) {
    const userId = typedSession?.user?.id;
    if (!userId) return;
    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        const result = await updateContent(editingId, userId, data);
        if (!result.success) {
          setFormError(result.errors?.[0]?.message ?? "Failed to update content");
          return;
        }
      } else {
        const result = await createContent(userId, data);
        if (!result.success) {
          setFormError(result.errors?.[0]?.message ?? "Failed to create content");
          return;
        }
      }
      setFormOpen(false);
      await fetchContent();
    } catch {
      setFormError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish(page: ContentRow) {
    try {
      await togglePublishStatus(page.id, !page.published);
      await fetchContent();
    } catch {
      // silently fail
    }
  }

  if (status === "loading") {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Management</h1>
          <p className="text-sm text-muted-foreground">Create, edit, and publish content pages.</p>
        </div>
        <Button onClick={openCreateDialog}>Create Page</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading content…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No content pages yet.
                </TableCell>
              </TableRow>
            ) : (
              pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-medium">{page.title}</TableCell>
                  <TableCell className="text-muted-foreground">{page.slug}</TableCell>
                  <TableCell>
                    <Badge variant={page.published ? "default" : "secondary"}>
                      {page.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(page.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(page)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={page.published ? "secondary" : "default"}
                        onClick={() => handleTogglePublish(page)}
                      >
                        {page.published ? "Unpublish" : "Publish"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Content" : "Create Content"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the content page." : "Fill in the content page details."}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Page title" disabled={saving} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="page-slug" disabled={saving} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Body</FormLabel>
                    <FormControl>
                      <textarea
                        className="min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                        placeholder="Page content…"
                        disabled={saving}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
