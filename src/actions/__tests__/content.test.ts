// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  prisma: {
    contentPage: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache", () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  invalidateCache: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn(),
}));

import {
  getPublishedContent,
  listPublishedContent,
  createContent,
  updateContent,
  togglePublishStatus,
} from "../content";
import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import type { ContentInput } from "@/types";

const validContent: ContentInput = {
  slug: "about",
  title: "About Us",
  body: "<p>Welcome to the platform.</p>",
  published: true,
};

const mockPage = {
  id: "page-1",
  slug: "about",
  title: "About Us",
  body: "<p>Welcome to the platform.</p>",
  published: true,
  authorId: "author-1",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-02"),
};

describe("getPublishedContent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null for empty slug", async () => {
    const result = await getPublishedContent("");
    expect(result).toBeNull();
  });

  it("returns cached content when available", async () => {
    (getCached as jest.Mock).mockResolvedValue(mockPage);

    const result = await getPublishedContent("about");
    expect(result).toEqual(mockPage);
    expect(prisma.contentPage.findUnique).not.toHaveBeenCalled();
  });

  it("queries DB on cache miss and caches result", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.contentPage.findUnique as jest.Mock).mockResolvedValue(mockPage);

    const result = await getPublishedContent("about");
    expect(result).toEqual(mockPage);
    expect(prisma.contentPage.findUnique).toHaveBeenCalledWith({
      where: { slug: "about" },
    });
    expect(setCached).toHaveBeenCalledWith(
      "content:about",
      mockPage,
      600
    );
  });

  it("returns null for unpublished content", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.contentPage.findUnique as jest.Mock).mockResolvedValue({
      ...mockPage,
      published: false,
    });

    const result = await getPublishedContent("about");
    expect(result).toBeNull();
  });

  it("returns null when page not found", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.contentPage.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getPublishedContent("nonexistent");
    expect(result).toBeNull();
  });
});

describe("listPublishedContent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns cached list when available", async () => {
    const cachedList = [{ id: "1", slug: "about", title: "About", published: true, updatedAt: new Date() }];
    (getCached as jest.Mock).mockResolvedValue(cachedList);

    const result = await listPublishedContent();
    expect(result).toEqual(cachedList);
    expect(prisma.contentPage.findMany).not.toHaveBeenCalled();
  });

  it("queries DB on cache miss and caches result", async () => {
    const pages = [
      { id: "1", slug: "about", title: "About", published: true, updatedAt: new Date() },
    ];
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.contentPage.findMany as jest.Mock).mockResolvedValue(pages);

    const result = await listPublishedContent();
    expect(result).toEqual(pages);
    expect(setCached).toHaveBeenCalledWith("content:list", pages, 600);
  });
});

describe("createContent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns error when authorId is empty", async () => {
    const result = await createContent("", validContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual([
        { field: "authorId", message: "Author ID is required" },
      ]);
    }
  });

  it("returns validation errors for invalid input", async () => {
    const result = await createContent("author-1", {
      slug: "",
      title: "",
      body: "",
      published: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain("slug");
      expect(fields).toContain("title");
      expect(fields).toContain("body");
    }
  });

  it("creates content and caches when published", async () => {
    (prisma.contentPage.create as jest.Mock).mockResolvedValue(mockPage);

    const result = await createContent("author-1", validContent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockPage);
    }
    expect(prisma.contentPage.create).toHaveBeenCalledWith({
      data: {
        slug: "about",
        title: "About Us",
        body: "<p>Welcome to the platform.</p>",
        published: true,
        authorId: "author-1",
      },
    });
    expect(setCached).toHaveBeenCalledWith("content:about", mockPage, 600);
    expect(invalidateCache).toHaveBeenCalledWith("content:list");
  });

  it("creates content without caching when unpublished", async () => {
    const unpublished = { ...mockPage, published: false };
    (prisma.contentPage.create as jest.Mock).mockResolvedValue(unpublished);

    const result = await createContent("author-1", { ...validContent, published: false });
    expect(result.success).toBe(true);
    expect(setCached).not.toHaveBeenCalledWith(
      expect.stringContaining("content:about"),
      expect.anything(),
      expect.anything()
    );
    expect(invalidateCache).toHaveBeenCalledWith("content:list");
  });
});

describe("updateContent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns error when id is empty", async () => {
    const result = await updateContent("", "author-1", validContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual([
        { field: "id", message: "Content ID is required" },
      ]);
    }
  });

  it("returns validation errors for invalid input", async () => {
    const result = await updateContent("page-1", "author-1", {
      slug: "",
      title: "",
      body: "",
      published: true,
    });
    expect(result.success).toBe(false);
  });

  it("updates content and invalidates old slug cache when slug changes", async () => {
    (prisma.contentPage.findUnique as jest.Mock).mockResolvedValue({
      slug: "old-slug",
    });
    (prisma.contentPage.update as jest.Mock).mockResolvedValue(mockPage);

    const result = await updateContent("page-1", "author-1", validContent);
    expect(result.success).toBe(true);
    expect(invalidateCache).toHaveBeenCalledWith("content:old-slug");
    expect(setCached).toHaveBeenCalledWith("content:about", mockPage, 600);
    expect(invalidateCache).toHaveBeenCalledWith("content:list");
  });

  it("invalidates cache when unpublishing", async () => {
    (prisma.contentPage.findUnique as jest.Mock).mockResolvedValue({
      slug: "about",
    });
    const unpublished = { ...mockPage, published: false };
    (prisma.contentPage.update as jest.Mock).mockResolvedValue(unpublished);

    await updateContent("page-1", "author-1", { ...validContent, published: false });
    expect(invalidateCache).toHaveBeenCalledWith("content:about");
  });
});

describe("togglePublishStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("publishes and caches content", async () => {
    (prisma.contentPage.update as jest.Mock).mockResolvedValue(mockPage);

    await togglePublishStatus("page-1", true);

    expect(prisma.contentPage.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { published: true },
    });
    expect(setCached).toHaveBeenCalledWith("content:about", mockPage, 600);
    expect(invalidateCache).toHaveBeenCalledWith("content:list");
  });

  it("unpublishes and invalidates cache", async () => {
    (prisma.contentPage.update as jest.Mock).mockResolvedValue({
      ...mockPage,
      published: false,
    });

    await togglePublishStatus("page-1", false);

    expect(prisma.contentPage.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { published: false },
    });
    expect(invalidateCache).toHaveBeenCalledWith("content:about");
    expect(invalidateCache).toHaveBeenCalledWith("content:list");
  });
});
