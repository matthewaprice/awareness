"use server";

import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { logAuditEvent } from "@/lib/audit";
import { contentPageSchema } from "@/lib/validation";
import type { ContentInput, FieldError } from "@/types";

/** TTL for published content cache: 10 minutes */
const CONTENT_CACHE_TTL = 10 * 60;

/**
 * Content page shape returned by queries.
 */
type ContentPage = {
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Summary shape for listing published content.
 */
type ContentPageSummary = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  updatedAt: Date;
};

/**
 * Get a single published content page by slug.
 * Checks Redis cache first, falls back to DB.
 * Requirements: 6.1
 */
export async function getPublishedContent(
  slug: string
): Promise<ContentPage | null> {
  if (!slug) return null;

  // Check cache
  const cacheKey = `content:${slug}`;
  const cached = await getCached<ContentPage>(cacheKey);
  if (cached) return cached;

  // Query DB — only published pages
  const page = await prisma.contentPage.findUnique({
    where: { slug },
  });

  if (!page || !page.published) return null;

  // Cache the result
  await setCached(cacheKey, page, CONTENT_CACHE_TTL);

  return page as ContentPage;
}

/**
 * List all published content pages (summary only).
 * Requirements: 6.1
 */
export async function listPublishedContent(): Promise<ContentPageSummary[]> {
  const cacheKey = "content:list";
  const cached = await getCached<ContentPageSummary[]>(cacheKey);
  if (cached) return cached;

  const pages = await prisma.contentPage.findMany({
    where: { published: true },
    select: {
      id: true,
      slug: true,
      title: true,
      published: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  await setCached(cacheKey, pages, CONTENT_CACHE_TTL);

  return pages;
}

/**
 * Create a new content page.
 * Validates input with Zod. Requires authorId.
 * Requirements: 6.4
 */
export async function createContent(
  authorId: string,
  data: ContentInput
): Promise<
  { success: true; data: ContentPage } | { success: false; errors: FieldError[] }
> {
  if (!authorId) {
    return {
      success: false,
      errors: [{ field: "authorId", message: "Author ID is required" }],
    };
  }

  const parsed = contentPageSchema.safeParse(data);
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  const { slug, title, body, published } = parsed.data;

  const page = await prisma.contentPage.create({
    data: { slug, title, body, published, authorId },
  });

  // If published, cache it; also invalidate the list cache
  if (published) {
    await setCached(`content:${slug}`, page, CONTENT_CACHE_TTL);
  }
  await invalidateCache("content:list");

  return { success: true, data: page as ContentPage };
}

/**
 * Update an existing content page by ID.
 * Validates input with Zod. Requires authorId.
 * Requirements: 6.4
 */
export async function updateContent(
  id: string,
  authorId: string,
  data: ContentInput
): Promise<
  { success: true; data: ContentPage } | { success: false; errors: FieldError[] }
> {
  if (!id) {
    return {
      success: false,
      errors: [{ field: "id", message: "Content ID is required" }],
    };
  }

  const parsed = contentPageSchema.safeParse(data);
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  const { slug, title, body, published } = parsed.data;

  // Get the old page to know its slug for cache invalidation
  const oldPage = await prisma.contentPage.findUnique({
    where: { id },
    select: { slug: true },
  });

  const page = await prisma.contentPage.update({
    where: { id },
    data: { slug, title, body, published, authorId },
  });

  // Invalidate old slug cache if slug changed
  if (oldPage && oldPage.slug !== slug) {
    await invalidateCache(`content:${oldPage.slug}`);
  }

  // Update or invalidate cache for current slug
  if (published) {
    await setCached(`content:${slug}`, page, CONTENT_CACHE_TTL);
  } else {
    await invalidateCache(`content:${slug}`);
  }
  await invalidateCache("content:list");

  return { success: true, data: page as ContentPage };
}

/**
 * Toggle the publish status of a content page.
 * Invalidates relevant caches.
 * Requirements: 6.4
 */
export async function togglePublishStatus(
  id: string,
  published: boolean
): Promise<void> {
  const page = await prisma.contentPage.update({
    where: { id },
    data: { published },
  });

  await logAuditEvent({
    userId: page.authorId,
    action: published ? "CONTENT_PUBLISH" : "CONTENT_UNPUBLISH",
    entityType: "ContentPage",
    entityId: id,
    metadata: { slug: page.slug },
  });

  // Update cache based on new status
  if (published) {
    await setCached(`content:${page.slug}`, page, CONTENT_CACHE_TTL);
  } else {
    await invalidateCache(`content:${page.slug}`);
  }
  await invalidateCache("content:list");
}
