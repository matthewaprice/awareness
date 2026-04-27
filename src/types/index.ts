/**
 * Shared TypeScript type definitions for the Rare Disease Platform.
 *
 * Standalone enums are defined here to avoid tight coupling with Prisma
 * generated client. Values mirror the Prisma schema enums.
 */

// --- Enums (standalone, matching Prisma schema) ---

export const Role = {
  PATIENT: "PATIENT",
  PHYSICIAN: "PHYSICIAN",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SurveyStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type SurveyStatus = (typeof SurveyStatus)[keyof typeof SurveyStatus];

export const QuestionType = {
  TEXT: "TEXT",
  NUMBER: "NUMBER",
  SINGLE_CHOICE: "SINGLE_CHOICE",
  MULTI_CHOICE: "MULTI_CHOICE",
  SCALE: "SCALE",
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

// --- Auth types ---

/** Input for user login (Requirement 1.4) */
export interface LoginInput {
  email: string;
  password: string;
}

/** Input for user registration (Requirement 1.1) */
export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role: "PATIENT" | "PHYSICIAN";
}

/** JWT token payload enriched with role (Requirement 1.4) — no PII stored in token */
export interface TokenWithRole {
  id: string;
  role: Role;
  emailVerified: boolean;
}

/** Session object enriched with role (Requirement 1.4) — no PII in session token */
export interface SessionWithRole {
  user: {
    id: string;
    role: Role;
    name?: string;
  };
}

// --- Survey types ---

/** Survey submission payload (Requirement 2.3, 3.1) */
export interface SurveySubmission {
  surveyId: string;
  patientId: string;
  responses: {
    questionId: string;
    answer: string | number | string[];
  }[];
}

/** Survey draft for auto-save (Requirement 2.6, 2.7) */
export interface SurveyDraft {
  surveyId: string;
  patientId: string;
  responses: Partial<SurveySubmission["responses"]>;
  lastSavedAt: Date;
}

// --- Physician types ---

/** Physician profile creation/update input (Requirement 4.2) */
export interface PhysicianProfileInput {
  credentials: string;
  specialty: string;
  practiceName: string;
  practiceAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website?: string;
}

/** Physician search query parameters (Requirement 5.1) */
export interface PhysicianSearchQuery {
  location?: string;
  name?: string;
  specialty?: string;
  page: number;
  pageSize: number;
}

// --- Content types ---

/** Content page creation/update input (Requirement 6.4) */
export interface ContentInput {
  slug: string;
  title: string;
  body: string;
  published: boolean;
}

// --- Admin types ---

/** Filters for admin user listing (Requirement 7.2) */
export interface UserFilters {
  search?: string;
  role?: Role;
  active?: boolean;
  page: number;
  pageSize: number;
}

/** Admin dashboard metrics (Requirement 7.6) */
export interface DashboardMetrics {
  totalUsers: number;
  totalPatients: number;
  totalPhysicians: number;
  surveyCompletionCount: number;
  activePhysicianProfiles: number;
}

// --- Admin survey management types ---

/** Input for creating/editing a survey question (Requirement 7.3) */
export interface QuestionInput {
  questionText: string;
  questionType: QuestionType;
  options?: unknown;
  required: boolean;
  orderIndex: number;
}

/** Input for creating/editing a survey (Requirement 7.3) */
export interface SurveyInput {
  title: string;
  description: string;
  questions: QuestionInput[];
}

/** Summary of a user for admin listing (Requirement 7.2) */
export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  emailVerified: boolean;
  createdAt: Date;
}

// --- Shared utility types ---

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Field-level validation error */
export interface FieldError {
  field: string;
  message: string;
}
