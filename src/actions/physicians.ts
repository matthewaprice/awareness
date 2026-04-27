"use server";

import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import {
  physicianProfileSchema,
  physicianSearchSchema,
} from "@/lib/validation";
import type {
  PhysicianProfileInput,
  PhysicianSearchQuery,
  PaginatedResult,
  FieldError,
} from "@/types";
import crypto from "crypto";

/** TTL for physician search result cache: 5 minutes */
const SEARCH_CACHE_TTL = 5 * 60;

/**
 * Create or update a physician's registry profile.
 * Validates input with Zod, then upserts based on userId.
 * Requirements: 4.1, 4.2, 4.4
 */
export async function createOrUpdateProfile(
  userId: string,
  data: PhysicianProfileInput
): Promise<{ success: boolean; errors?: FieldError[] }> {
  if (!userId) {
    return {
      success: false,
      errors: [{ field: "userId", message: "User ID is required" }],
    };
  }

  // Validate input with Zod
  const parsed = physicianProfileSchema.safeParse(data);
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  const profileData = parsed.data;

  // Upsert based on userId (Req 4.4: overwrite previous profile data)
  await prisma.physicianProfile.upsert({
    where: { userId },
    create: {
      userId,
      credentials: profileData.credentials,
      specialty: profileData.specialty,
      practiceName: profileData.practiceName,
      practiceAddress: profileData.practiceAddress,
      city: profileData.city,
      state: profileData.state,
      zipCode: profileData.zipCode,
      phone: profileData.phone,
      website: profileData.website ?? null,
    },
    update: {
      credentials: profileData.credentials,
      specialty: profileData.specialty,
      practiceName: profileData.practiceName,
      practiceAddress: profileData.practiceAddress,
      city: profileData.city,
      state: profileData.state,
      zipCode: profileData.zipCode,
      phone: profileData.phone,
      website: profileData.website ?? null,
    },
  });

  // Invalidate search cache since profile data changed
  await invalidateCache("physician-search:*");

  return { success: true };
}

/**
 * Get a physician profile by user ID.
 * Requirements: 4.1
 */
export async function getPhysicianProfile(physicianId: string) {
  if (!physicianId) {
    return null;
  }

  const profile = await prisma.physicianProfile.findUnique({
    where: { userId: physicianId },
    include: { user: { select: { fullName: true, email: true } } },
  });

  return profile;
}

/**
 * Toggle a physician profile's active/inactive status.
 * Requirements: 4.5
 */
export async function toggleProfileVisibility(
  physicianId: string,
  active: boolean
): Promise<void> {
  await prisma.physicianProfile.update({
    where: { userId: physicianId },
    data: { active },
  });

  // Invalidate search cache since visibility changed
  await invalidateCache("physician-search:*");
}

/**
 * Search for physicians by location, name, and/or specialty.
 * Returns only active AND approved profiles, with pagination.
 * Results are cached in Redis.
 * Requirements: 4.5, 5.2
 */
export async function searchPhysicians(
  query: PhysicianSearchQuery
): Promise<PaginatedResult<PhysicianProfile>> {
  // Validate search query
  const parsed = physicianSearchSchema.safeParse(query);
  if (!parsed.success) {
    return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }

  const { location, name, specialty, page, pageSize } = parsed.data;

  // Check cache first
  const cacheKey = buildSearchCacheKey({ location, name, specialty, page, pageSize });
  const cached = await getCached<PaginatedResult<PhysicianProfile>>(cacheKey);
  if (cached) {
    return cached;
  }

  // Build where clause: only active AND approved profiles
  const where: Record<string, unknown> = {
    active: true,
    approved: true,
  };

  const andConditions: Record<string, unknown>[] = [];

  // Location filter: matches city, state, or zipCode
  if (location) {
    andConditions.push({
      OR: [
        { city: { contains: location, mode: "insensitive" } },
        { state: { contains: location, mode: "insensitive" } },
        { zipCode: { contains: location, mode: "insensitive" } },
      ],
    });
  }

  // Name filter: matches practiceName or user fullName
  if (name) {
    andConditions.push({
      OR: [
        { practiceName: { contains: name, mode: "insensitive" } },
        { user: { fullName: { contains: name, mode: "insensitive" } } },
      ],
    });
  }

  // Specialty filter
  if (specialty) {
    andConditions.push({
      specialty: { contains: specialty, mode: "insensitive" },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // Get total count for pagination
  const total = await prisma.physicianProfile.count({ where: where as never });

  const skip = (page - 1) * pageSize;

  // Fetch paginated results
  const profiles = await prisma.physicianProfile.findMany({
    where: where as never,
    include: { user: { select: { fullName: true, email: true } } },
    skip,
    take: pageSize,
    orderBy: { createdAt: "desc" },
  });

  const totalPages = Math.ceil(total / pageSize);

  const result: PaginatedResult<PhysicianProfile> = {
    data: profiles as unknown as PhysicianProfile[],
    total,
    page,
    pageSize,
    totalPages,
  };

  // Cache the result
  await setCached(cacheKey, result, SEARCH_CACHE_TTL);

  return result;
}

/**
 * Build a deterministic cache key for a physician search query.
 */
function buildSearchCacheKey(query: {
  location?: string;
  name?: string;
  specialty?: string;
  page: number;
  pageSize: number;
}): string {
  const normalized = JSON.stringify({
    location: (query.location ?? "").toLowerCase().trim(),
    name: (query.name ?? "").toLowerCase().trim(),
    specialty: (query.specialty ?? "").toLowerCase().trim(),
    page: query.page,
    pageSize: query.pageSize,
  });
  const hash = crypto.createHash("md5").update(normalized).digest("hex");
  return `physician-search:${hash}`;
}

/**
 * Type alias for physician profile with user relation included in search results.
 */
type PhysicianProfile = {
  id: string;
  userId: string;
  credentials: string;
  specialty: string;
  practiceName: string;
  practiceAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website: string | null;
  active: boolean;
  approved: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    fullName: string;
    email: string;
  };
};
