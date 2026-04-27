import { prisma } from "@/lib/db";

/**
 * Audit event action types for authentication and administrative events.
 * Requirement 9.6
 */
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "USER_STATUS_CHANGE"
  | "USER_ROLE_CHANGE"
  | "CONTENT_PUBLISH"
  | "CONTENT_UNPUBLISH"
  | "CONTENT_CREATE"
  | "CONTENT_UPDATE"
  | "PHYSICIAN_PROFILE_APPROVED"
  | "PHYSICIAN_PROFILE_REJECTED"
  | "PHYSICIAN_PROFILE_REMOVED"
  | "SURVEY_PUBLISHED"
  | "SURVEY_ARCHIVED"
  | "ACCOUNT_DELETION";

/**
 * Log an audit event to the AuditLog table.
 *
 * Fire-and-forget: errors are caught and logged to console so they
 * never break the calling action.
 *
 * Requirement 9.6
 */
export async function logAuditEvent(params: {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? null,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to write audit event:", error);
  }
}
