"use server";

import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { surveyResponseSchema } from "@/lib/validation";
import type { SurveySubmission, SurveyDraft, FieldError } from "@/types";
import { Role } from "@/types";

/** TTL for survey drafts in Redis: 7 days */
const DRAFT_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Get all published surveys available for a patient.
 * Requirements: 2.1
 */
export async function getAvailableSurveys(patientId: string) {
  if (!patientId) {
    return [];
  }

  const surveys = await prisma.survey.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      version: true,
      status: true,
      createdAt: true,
      publishedAt: true,
    },
  });

  return surveys;
}

/**
 * Get a single survey with its questions by ID.
 * Requirements: 2.1
 */
export async function getSurveyById(surveyId: string) {
  if (!surveyId) {
    return null;
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  return survey;
}

/**
 * Submit a completed survey response.
 * Validates with Zod, stores in DB with timestamp/patientId/surveyVersion.
 * Never overwrites previous submissions (append-only, Req 3.4).
 * Requirements: 2.3, 3.1, 3.4
 */
export async function submitSurveyResponse(
  data: SurveySubmission
): Promise<{ success: boolean; errors?: FieldError[] }> {
  // Validate input with Zod
  const parsed = surveyResponseSchema.safeParse(data);
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  const { surveyId, patientId, responses } = parsed.data;

  // Fetch the survey to get its current version
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, version: true, status: true },
  });

  if (!survey) {
    return {
      success: false,
      errors: [{ field: "surveyId", message: "Survey not found" }],
    };
  }

  if (survey.status !== "PUBLISHED") {
    return {
      success: false,
      errors: [{ field: "surveyId", message: "Survey is not available for submission" }],
    };
  }

  // Validate that all questionIds belong to this survey
  const surveyQuestions = await prisma.surveyQuestion.findMany({
    where: { surveyId },
    select: { id: true, required: true },
  });

  const questionIds = new Set(surveyQuestions.map((q) => q.id));
  const requiredIds = new Set(
    surveyQuestions.filter((q) => q.required).map((q) => q.id)
  );

  // Check for invalid question IDs
  const invalidQuestions = responses.filter((r) => !questionIds.has(r.questionId));
  if (invalidQuestions.length > 0) {
    return {
      success: false,
      errors: invalidQuestions.map((r) => ({
        field: `responses.${r.questionId}`,
        message: "Question does not belong to this survey",
      })),
    };
  }

  // Check for missing required questions
  const answeredIds = new Set(responses.map((r) => r.questionId));
  const missingRequired = [...requiredIds].filter((id) => !answeredIds.has(id));
  if (missingRequired.length > 0) {
    return {
      success: false,
      errors: missingRequired.map((id) => ({
        field: `responses.${id}`,
        message: "This question is required",
      })),
    };
  }

  // Create the response record (append-only — never overwrite, Req 3.4)
  // Stores timestamp (submittedAt default), patientId, and surveyVersion (Req 3.1)
  await prisma.surveyResponse.create({
    data: {
      surveyId,
      patientId,
      surveyVersion: survey.version,
      answers: {
        create: responses.map((r) => ({
          question: { connect: { id: r.questionId } },
          answer: r.answer as never,
        })),
      },
    },
  });

  // Invalidate aggregation and dashboard caches since new data was added
  await invalidateCache("aggregation:*");
  await invalidateCache("metrics:dashboard");

  return { success: true };
}

/**
 * Save a survey draft to Redis for later resumption.
 * Key format: survey-draft:{patientId}:{surveyId}
 * Requirements: 2.6
 */
export async function saveSurveyDraft(data: SurveyDraft): Promise<void> {
  const key = `survey-draft:${data.patientId}:${data.surveyId}`;
  await setCached(key, data, DRAFT_TTL_SECONDS);
}

/**
 * Load a survey draft from Redis.
 * Requirements: 2.6
 */
export async function getSurveyDraft(
  patientId: string,
  surveyId: string
): Promise<SurveyDraft | null> {
  const key = `survey-draft:${patientId}:${surveyId}`;
  return getCached<SurveyDraft>(key);
}

/**
 * Session shape expected by access-control helpers.
 */
interface Session {
  id: string;
  role: string;
}

/**
 * Get survey responses for a patient, with access control.
 *
 * - PATIENT users can only retrieve their own responses (session.id must match targetPatientId).
 * - ADMIN users can retrieve any patient's responses.
 * - Returns { success: false, error: "Forbidden" } when a patient tries to access another patient's data.
 *
 * Requirements: 2.8, 9.3
 */
export async function getSurveyResponses(
  session: Session,
  targetPatientId?: string
): Promise<
  | { success: true; data: Awaited<ReturnType<typeof prisma.surveyResponse.findMany>> }
  | { success: false; error: string }
> {
  const patientId = targetPatientId ?? session.id;

  if (session.role === Role.PATIENT && session.id !== patientId) {
    return { success: false, error: "Forbidden" };
  }

  if (session.role !== Role.PATIENT && session.role !== Role.ADMIN) {
    return { success: false, error: "Forbidden" };
  }

  const responses = await prisma.surveyResponse.findMany({
    where: { patientId },
    include: { answers: true, survey: true },
    orderBy: { submittedAt: "desc" },
  });

  return { success: true, data: responses };
}

/**
 * Get a single survey response by ID, with access control.
 *
 * - PATIENT users can only retrieve a response they own (response.patientId must match session.id).
 * - ADMIN users can retrieve any response.
 * - Returns { success: false, error } for not-found or forbidden access.
 *
 * Requirements: 2.8, 9.3
 */
export async function getSurveyResponseById(
  session: Session,
  responseId: string
): Promise<
  | { success: true; data: NonNullable<Awaited<ReturnType<typeof prisma.surveyResponse.findUnique>>> }
  | { success: false; error: string }
> {
  if (!responseId) {
    return { success: false, error: "Response ID is required" };
  }

  const response = await prisma.surveyResponse.findUnique({
    where: { id: responseId },
    include: { answers: true, survey: true },
  });

  if (!response) {
    return { success: false, error: "Not found" };
  }

  if (session.role === Role.PATIENT && session.id !== response.patientId) {
    return { success: false, error: "Forbidden" };
  }

  if (session.role !== Role.PATIENT && session.role !== Role.ADMIN) {
    return { success: false, error: "Forbidden" };
  }

  return { success: true, data: response };
}
