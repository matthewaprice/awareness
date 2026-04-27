/**
 * Property 2: Login/logout session lifecycle
 *
 * For any registered and verified user with valid credentials,
 * logging in should create a session in the Session_Store,
 * and subsequently logging out should remove that session so it is no longer valid.
 *
 * Feature: rare-disease-platform, Property 2: Login/logout session lifecycle
 * Validates: Requirements 1.4, 1.7
 */

import fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const sessionStore = new Map<string, string>();

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
  createSession: jest.fn(async (userId: string) => {
    sessionStore.set(`session:${userId}`, JSON.stringify({ userId, createdAt: Date.now() }));
  }),
  invalidateSession: jest.fn(async (userId: string) => {
    sessionStore.delete(`session:${userId}`);
  }),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/redis", () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("@/lib/email", () => ({
  emailService: { send: jest.fn() },
}));

import { authOptions } from "@/lib/auth";
import { logoutUser } from "@/actions/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";

// Extract the authorize function from the credentials provider
const credentialsProvider = authOptions.providers[0] as unknown as {
  authorize: (credentials: Record<string, string> | undefined, req: unknown) => Promise<unknown>;
};
const authorize = credentialsProvider.authorize;

// Extract the jwt callback to trigger session creation
const jwtCallback = authOptions.callbacks!.jwt! as (params: {
  token: Record<string, unknown>;
  user: unknown;
  account: unknown;
  trigger?: string;
}) => Promise<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const userIdArb = fc.stringMatching(/^[a-f0-9]{8}$/).map((s) => `user-${s}`);
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z]{2,5}$/)
  )
  .map(([local, domain]) => `${local}@${domain}.com`);
const passwordArb = fc.stringMatching(/^[A-Za-z0-9!@#]{8,16}$/);
const fullNameArb = fc
  .tuple(
    fc.stringMatching(/^[A-Z][a-z]{1,8}$/),
    fc.stringMatching(/^[A-Z][a-z]{1,8}$/)
  )
  .map(([f, l]) => `${f} ${l}`);
const roleArb = fc.constantFrom("PATIENT" as const, "PHYSICIAN" as const);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("Property 2: Login/logout session lifecycle", () => {
  beforeEach(() => {
    sessionStore.clear();
    jest.clearAllMocks();
  });

  it(
    "for any registered/verified user, login creates a session and logout removes it",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          emailArb,
          passwordArb,
          fullNameArb,
          roleArb,
          async (userId, email, password, fullName, role) => {
            sessionStore.clear();
            jest.clearAllMocks();

            // Set up the mock user in the DB
            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
              id: userId,
              email,
              passwordHash: `$2b$12$hashed`,
              fullName,
              role,
              emailVerified: true,
            });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            // Step 1: Authorize (login)
            const user = await authorize({ email, password }, {});
            expect(user).toBeTruthy();

            // Step 2: Simulate JWT callback which creates the session
            await jwtCallback({
              token: { sub: userId },
              user: user as Record<string, unknown>,
              account: {},
              trigger: "signIn",
            });

            // Verify session was created
            expect(sessionStore.has(`session:${userId}`)).toBe(true);

            // Step 3: Logout
            const logoutResult = await logoutUser(userId);
            expect(logoutResult.success).toBe(true);

            // Verify session was removed
            expect(sessionStore.has(`session:${userId}`)).toBe(false);
          }
        ),
        { numRuns: 5 }
      );
    },
    30000
  );
});
