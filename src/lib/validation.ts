import { z } from "zod";

/**
 * Login form validation schema.
 * Requirements: 1.4
 */
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Registration form validation schema.
 * Requirements: 1.1
 */
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required"),
  role: z.enum(["PATIENT", "PHYSICIAN"]),
});

/**
 * Survey response submission validation schema.
 * Requirements: 2.3, 3.1
 */
export const surveyResponseSchema = z.object({
  surveyId: z.string().uuid("Invalid survey ID"),
  patientId: z.string().uuid("Invalid patient ID"),
  responses: z.array(
    z.object({
      questionId: z.string().uuid("Invalid question ID"),
      answer: z.union([z.string(), z.number(), z.array(z.string())]),
    })
  ),
});

/**
 * Physician profile validation schema.
 * Requirements: 4.2
 */
export const physicianProfileSchema = z.object({
  credentials: z.string().min(1, "Credentials are required"),
  specialty: z.string().min(1, "Specialty is required"),
  practiceName: z.string().min(1, "Practice name is required"),
  practiceAddress: z.string().min(1, "Practice address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "Zip code is required"),
  phone: z.string().min(1, "Phone number is required"),
  website: z.string().url("Invalid URL").optional(),
});

/**
 * Content page validation schema.
 * Requirements: 6.4
 */
export const contentPageSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  published: z.boolean(),
});

/**
 * Physician search query validation schema.
 * Requirements: 5.1
 */
export const physicianSearchSchema = z.object({
  location: z.string().optional(),
  name: z.string().optional(),
  specialty: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
});

/**
 * Survey question input validation schema.
 * Requirements: 7.3
 */
export const questionInputSchema = z.object({
  questionText: z.string().min(1, "Question text is required"),
  questionType: z.enum(["TEXT", "NUMBER", "SINGLE_CHOICE", "MULTI_CHOICE", "SCALE"]),
  options: z.unknown().optional(),
  required: z.boolean(),
  orderIndex: z.number().int().min(0),
});

/**
 * Survey creation/edit validation schema.
 * Requirements: 7.3
 */
export const surveyInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  questions: z.array(questionInputSchema).min(1, "At least one question is required"),
});

/**
 * User filters validation schema for admin user listing.
 * Requirements: 7.2
 */
export const userFiltersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(["PATIENT", "PHYSICIAN", "ADMIN"]).optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
});
