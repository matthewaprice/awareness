"use server";

import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { logAuditEvent } from "@/lib/audit";
import { surveyInputSchema, userFiltersSchema } from "@/lib/validation";
import type {
  UserFilters,
  DashboardMetrics,
  PaginatedResult,
  UserSummary,
  SurveyInput,
  FieldError,
  Role,
} from "@/types";

/** TTL for dashboard metrics cache: 5 minutes */
const METRICS_CACHE_TTL = 5 * 60;
const METRICS_CACHE_KEY = "metrics:dashboard";

// ---------------------------------------------------------------------------
// User Management (Requirement 7.2)
// ---------------------------------------------------------------------------

/**
 * List users with optional search, role, and active filters. Paginated.
 * Requirements: 7.2
 */
export async function listUsers(
  filters: UserFilters
): Promise<PaginatedResult<UserSummary>> {
  const parsed = userFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }

  const { search, role, active, page, pageSize } = parsed.data;

  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  if (search) {
    andConditions.push({
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (role) {
    where.role = role;
  }

  if (active !== undefined) {
    where.active = active;
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const total = await prisma.user.count({ where: where as never });
  const skip = (page - 1) * pageSize;

  const users = await prisma.user.findMany({
    where: where as never,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      active: true,
      emailVerified: true,
      createdAt: true,
    },
    skip,
    take: pageSize,
    orderBy: { createdAt: "desc" },
  });

  const totalPages = Math.ceil(total / pageSize);

  return {
    data: users as UserSummary[],
    total,
    page,
    pageSize,
    totalPages,
  };
}


/**
 * Activate or deactivate a user account.
 * Requirements: 7.2
 */
export async function updateUserStatus(
  userId: string,
  active: boolean
): Promise<void> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { active },
  });

  await logAuditEvent({
    userId,
    action: "USER_STATUS_CHANGE",
    entityType: "User",
    entityId: userId,
    metadata: { active },
  });

  // Invalidate dashboard metrics since user counts may change
  await invalidateCache(METRICS_CACHE_KEY);
}

/**
 * Change a user's role.
 * Requirements: 7.2
 */
export async function updateUserRole(
  userId: string,
  role: Role
): Promise<void> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  // Invalidate dashboard metrics since role counts change
  await invalidateCache(METRICS_CACHE_KEY);
}

// ---------------------------------------------------------------------------
// Dashboard Metrics (Requirement 7.6)
// ---------------------------------------------------------------------------

/**
 * Get dashboard metrics, cached in Redis under "metrics:dashboard".
 * Requirements: 7.6
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  // Check cache first
  const cached = await getCached<DashboardMetrics>(METRICS_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const [totalUsers, totalPatients, totalPhysicians, surveyCompletionCount, activePhysicianProfiles] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.user.count({ where: { role: "PHYSICIAN" } }),
      prisma.surveyResponse.count(),
      prisma.physicianProfile.count({ where: { active: true } }),
    ]);

  const metrics: DashboardMetrics = {
    totalUsers,
    totalPatients,
    totalPhysicians,
    surveyCompletionCount,
    activePhysicianProfiles,
  };

  await setCached(METRICS_CACHE_KEY, metrics, METRICS_CACHE_TTL);

  return metrics;
}

// ---------------------------------------------------------------------------
// Survey Listing for Admin (Requirement 7.3)
// ---------------------------------------------------------------------------

/**
 * List all surveys for admin management.
 * Requirements: 7.3
 */
export async function listAllSurveys() {
  const surveys = await prisma.survey.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true, responses: true } },
    },
  });

  return surveys;
}

// ---------------------------------------------------------------------------
// Content Listing for Admin (Requirement 7.4)
// ---------------------------------------------------------------------------

/**
 * List all content pages for admin management.
 * Requirements: 7.4
 */
export async function listAllContent() {
  const pages = await prisma.contentPage.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      body: true,
      published: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return pages;
}

// ---------------------------------------------------------------------------
// Physician Listing for Admin (Requirement 7.5)
// ---------------------------------------------------------------------------

/**
 * List all physician profiles for admin review.
 * Requirements: 7.5
 */
export async function listAllPhysicianProfiles() {
  const profiles = await prisma.physicianProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { fullName: true, email: true } } },
  });

  return profiles;
}

// ---------------------------------------------------------------------------
// Physician Profile Review (Requirement 7.5)
// ---------------------------------------------------------------------------

/**
 * Approve or reject a physician profile.
 * Requirements: 7.5
 */
export async function reviewPhysicianProfile(
  profileId: string,
  approved: boolean
): Promise<void> {
  if (!profileId) {
    throw new Error("Profile ID is required");
  }

  const profile = await prisma.physicianProfile.update({
    where: { id: profileId },
    data: { approved },
  });

  await logAuditEvent({
    userId: profile.userId,
    action: approved ? "PHYSICIAN_PROFILE_APPROVED" : "PHYSICIAN_PROFILE_REJECTED",
    entityType: "PhysicianProfile",
    entityId: profileId,
    metadata: { approved },
  });

  // Invalidate physician search cache and dashboard metrics
  await invalidateCache("physician-search:*");
  await invalidateCache(METRICS_CACHE_KEY);
}

/**
 * Remove a physician profile entirely.
 * Requirements: 7.5
 */
export async function removePhysicianProfile(
  profileId: string
): Promise<void> {
  if (!profileId) {
    throw new Error("Profile ID is required");
  }

  await prisma.physicianProfile.delete({
    where: { id: profileId },
  });

  await invalidateCache("physician-search:*");
  await invalidateCache(METRICS_CACHE_KEY);
}

// ---------------------------------------------------------------------------
// Survey Management (Requirement 7.3)
// ---------------------------------------------------------------------------

/**
 * Create a new survey with questions. Starts in DRAFT status.
 * Requirements: 7.3
 */
export async function createSurvey(
  data: SurveyInput
): Promise<
  { success: true; surveyId: string } | { success: false; errors: FieldError[] }
> {
  const parsed = surveyInputSchema.safeParse(data);
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  const { title, description, questions } = parsed.data;

  const survey = await prisma.survey.create({
    data: {
      title,
      description,
      status: "DRAFT",
      questions: {
        create: questions.map((q) => ({
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options as never,
          required: q.required,
          orderIndex: q.orderIndex,
        })),
      },
    },
  });

  return { success: true, surveyId: survey.id };
}

/**
 * Update an existing survey's title, description, and questions.
 * Only DRAFT surveys can be edited.
 * Requirements: 7.3
 */
export async function updateSurvey(
  surveyId: string,
  data: SurveyInput
): Promise<
  { success: true } | { success: false; errors: FieldError[] }
> {
  if (!surveyId) {
    return {
      success: false,
      errors: [{ field: "surveyId", message: "Survey ID is required" }],
    };
  }

  const parsed = surveyInputSchema.safeParse(data);
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  const existing = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { status: true },
  });

  if (!existing) {
    return {
      success: false,
      errors: [{ field: "surveyId", message: "Survey not found" }],
    };
  }

  if (existing.status !== "DRAFT") {
    return {
      success: false,
      errors: [{ field: "status", message: "Only draft surveys can be edited" }],
    };
  }

  const { title, description, questions } = parsed.data;

  // Delete existing questions and recreate
  await prisma.surveyQuestion.deleteMany({ where: { surveyId } });

  await prisma.survey.update({
    where: { id: surveyId },
    data: {
      title,
      description,
      questions: {
        create: questions.map((q) => ({
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options as never,
          required: q.required,
          orderIndex: q.orderIndex,
        })),
      },
    },
  });

  return { success: true };
}

/**
 * Publish a draft survey, making it available to patients.
 * Requirements: 7.3
 */
export async function publishSurvey(surveyId: string): Promise<void> {
  if (!surveyId) {
    throw new Error("Survey ID is required");
  }

  await prisma.survey.update({
    where: { id: surveyId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  await logAuditEvent({
    userId: "system",
    action: "SURVEY_PUBLISHED",
    entityType: "Survey",
    entityId: surveyId,
  });
}

/**
 * Archive a survey, removing it from the available surveys list.
 * Requirements: 7.3
 */
export async function archiveSurvey(surveyId: string): Promise<void> {
  if (!surveyId) {
    throw new Error("Survey ID is required");
  }

  await prisma.survey.update({
    where: { id: surveyId },
    data: { status: "ARCHIVED" },
  });

  await logAuditEvent({
    userId: "system",
    action: "SURVEY_ARCHIVED",
    entityType: "Survey",
    entityId: surveyId,
  });
}
