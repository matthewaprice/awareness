/**
 * Property 1: Registration round-trip
 *
 * For any valid registration input (email, password, full name, role),
 * registering the user and then verifying the email token should result
 * in a verified user account with matching email, full name, and role.
 *
 * Feature: rare-disease-platform, Property 1: Registration round-trip
 * Validates: Requirements 1.2, 1.3
 */

import fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that reference them
// ---------------------------------------------------------------------------

const userStore = new Map<string, Record<string, unknown>>();
const redisStore = new Map<string, string>();
let userIdCounter = 0;

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          for (const u of userStore.values()) {
            if (u.email === where.email) return u;
          }
        }
        if (where.id) return userStore.get(where.id) ?? null;
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `user-${++userIdCounter}`;
        const user = { id, ...data };
        userStore.set(id, user);
        return user;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const user = userStore.get(where.id);
        if (user) {
          Object.assign(user, data);
          userStore.set(where.id, user);
        }
        return user;
      }),
    },
  },
}));

jest.mock("@/lib/redis", () => ({
  redis: {
    set: jest.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
  },
}));

jest.mock("@/lib/email", () => ({
  emailService: {
    send: jest.fn(async () => undefined),
  },
}));

jest.mock("@/lib/cache", () => ({
  invalidateSession: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

// Use real bcrypt for hashing (but mock it to be fast with low rounds)
jest.mock("bcrypt", () => ({
  hash: jest.fn(async (password: string) => `hashed:${password}`),
  compare: jest.fn(),
}));

jest.mock("crypto", () => ({
  randomBytes: jest.fn(() => {
    const token = `token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { toString: () => token };
  }),
}));

import { registerUser, verifyEmail } from "@/actions/auth";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid email address */
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
    fc.stringMatching(/^[a-z]{2,6}$/),
    fc.constantFrom("com", "org", "net", "io")
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Generate a valid password (≥8 chars) */
const passwordArb = fc.stringMatching(/^[A-Za-z0-9!@#$%]{8,20}$/);

/** Generate a valid full name */
const fullNameArb = fc
  .tuple(
    fc.stringMatching(/^[A-Z][a-z]{1,10}$/),
    fc.stringMatching(/^[A-Z][a-z]{1,10}$/)
  )
  .map(([first, last]) => `${first} ${last}`);

/** Generate a valid role */
const roleArb = fc.constantFrom("PATIENT" as const, "PHYSICIAN" as const);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("Property 1: Registration round-trip", () => {
  beforeEach(() => {
    userStore.clear();
    redisStore.clear();
    userIdCounter = 0;
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  it(
    "for any valid registration input, registering and verifying produces a verified user with matching data",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          passwordArb,
          fullNameArb,
          roleArb,
          async (email, password, fullName, role) => {
            // Clear stores for each iteration
            userStore.clear();
            redisStore.clear();
            userIdCounter = 0;
            jest.clearAllMocks();

            // Step 1: Register the user
            const regResult = await registerUser({ email, password, fullName, role });
            expect(regResult.success).toBe(true);

            // Step 2: Find the verification token stored in Redis
            const tokenKey = [...redisStore.keys()].find((k) =>
              k.startsWith("email-verify:")
            );
            expect(tokenKey).toBeDefined();
            const token = tokenKey!.replace("email-verify:", "");

            // Step 3: Verify the email
            const verifyResult = await verifyEmail(token);
            expect(verifyResult.success).toBe(true);

            // Step 4: Retrieve the user and check matching data
            const userId = [...userStore.keys()][0];
            const user = userStore.get(userId)!;

            expect(user.email).toBe(email);
            expect(user.fullName).toBe(fullName);
            expect(user.role).toBe(role);
            expect(user.emailVerified).toBe(true);
            // Password should be hashed, not plaintext
            expect(user.passwordHash).not.toBe(password);
          }
        ),
        { numRuns: 5 }
      );
    },
    30000
  );
});
