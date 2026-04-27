/**
 * Property 3: Invalid credentials produce generic error
 *
 * For any combination of invalid credentials (wrong email, wrong password, or both),
 * the error message returned by the Auth_System should be identical and should not
 * reveal which specific field was incorrect.
 *
 * Feature: rare-disease-platform, Property 3: Invalid credentials produce generic error
 * Validates: Requirements 1.5
 */

import fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(() => ({ GET: jest.fn(), POST: jest.fn() })),
}));

jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: jest.fn((config: Record<string, unknown>) => config),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
}));

jest.mock("@/lib/cache", () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";

const credentialsProvider = authOptions.providers[0] as unknown as {
  authorize: (credentials: Record<string, string> | undefined, req: unknown) => Promise<unknown>;
};
const authorize = credentialsProvider.authorize;

const GENERIC_ERROR = "Invalid email or password";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z]{2,5}$/)
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

const passwordArb = fc.stringMatching(/^[A-Za-z0-9!@#]{8,16}$/);

/** Scenario: wrong email (user not found), wrong password, or both */
const scenarioArb = fc.constantFrom(
  "wrong_email" as const,
  "wrong_password" as const,
  "both_wrong" as const
);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("Property 3: Invalid credentials produce generic error", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    "for any invalid credentials, the error message is always identical and generic",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          passwordArb,
          scenarioArb,
          async (email, password, scenario) => {
            jest.clearAllMocks();

            const existingUser = {
              id: "user-1",
              email: "real@user.com",
              passwordHash: "$2b$12$realhash",
              fullName: "Real User",
              role: "PATIENT",
              emailVerified: true,
            };

            switch (scenario) {
              case "wrong_email":
                // User not found in DB
                (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
                break;
              case "wrong_password":
                // User found but password doesn't match
                (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);
                (bcrypt.compare as jest.Mock).mockResolvedValue(false);
                break;
              case "both_wrong":
                // User not found (wrong email implies wrong password too)
                (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
                break;
            }

            // The authorize function should throw with the generic error
            let thrownError: Error | null = null;
            try {
              await authorize({ email, password }, {});
            } catch (e) {
              thrownError = e as Error;
            }

            expect(thrownError).not.toBeNull();
            // The error message must always be the same generic string
            expect(thrownError!.message).toBe(GENERIC_ERROR);

            // The message must NOT reveal which specific field was wrong
            // (e.g. "email not found" or "incorrect password" would be bad)
            expect(thrownError!.message.toLowerCase()).not.toContain("not found");
            expect(thrownError!.message.toLowerCase()).not.toContain("incorrect");
            expect(thrownError!.message.toLowerCase()).not.toContain("wrong");
            expect(thrownError!.message.toLowerCase()).not.toContain("unknown user");
          }
        ),
        { numRuns: 5 }
      );
    },
    30000
  );
});
