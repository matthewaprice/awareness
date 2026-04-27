"use server";

import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { registerSchema } from "@/lib/validation";
import { emailService } from "@/lib/email";
import { invalidateSession } from "@/lib/cache";
import { logAuditEvent } from "@/lib/audit";
import type { RegisterInput } from "@/types";

const VERIFICATION_TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds
const VERIFICATION_TOKEN_PREFIX = "email-verify:";

/**
 * Register a new user account.
 * Validates input, hashes password, creates user in DB, and sends verification email.
 */
export async function registerUser(
  data: RegisterInput
): Promise<{ success: boolean; error?: string }> {
  // Validate input
  const parsed = registerSchema.safeParse(data);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    return { success: false, error: firstError };
  }

  const { email, password, fullName, role } = parsed.data;

  // Check for existing user
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "Email already registered" };
  }

  // Hash password with bcrypt
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      role,
      emailVerified: false,
    },
  });

  // Generate verification token and store in Redis
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(
    `${VERIFICATION_TOKEN_PREFIX}${token}`,
    user.id,
    "EX",
    VERIFICATION_TOKEN_TTL
  );

  // Send verification email
  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`;
  await emailService.send({
    to: email,
    subject: "Verify your email address",
    html: `<p>Welcome to the Rare Disease Platform!</p><p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
  });

  return { success: true };
}

/**
 * Verify a user's email address using a token.
 */
export async function verifyEmail(
  token: string
): Promise<{ success: boolean; error?: string }> {
  if (!token) {
    return { success: false, error: "Invalid verification token" };
  }

  // Look up token in Redis
  const userId = await redis.get(`${VERIFICATION_TOKEN_PREFIX}${token}`);
  if (!userId) {
    return { success: false, error: "Invalid or expired verification token" };
  }

  // Mark user as verified
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });

  // Remove the used token
  await redis.del(`${VERIFICATION_TOKEN_PREFIX}${token}`);

  return { success: true };
}

/**
 * Request a password reset email. Stub for now — always returns success
 * to avoid revealing whether an email exists.
 */
export async function requestPasswordReset(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _email: string
): Promise<void> {
  // Stub: In production, generate a reset token, store in Redis, and email the user.
  // Always return void to avoid revealing whether the email exists.
}

/**
 * Invalidate the user's Redis session on logout.
 * Called before NextAuth signOut() to ensure the server-side session is cleared.
 * Requirement 1.7: Invalidate session in Session_Store on logout.
 */
export async function logoutUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: "User ID is required" };
  }

  try {
    await invalidateSession(userId);
    await logAuditEvent({
      userId,
      action: "LOGOUT",
      entityType: "User",
      entityId: userId,
    });
    return { success: true };
  } catch {
    return { success: false, error: "Failed to invalidate session" };
  }
}
