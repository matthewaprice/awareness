/**
 * Property 16: Session management lifecycle
 *
 * For any session created with a configurable TTL, the session should be stored
 * with the correct TTL. After an authenticated request, the session expiration
 * should be extended. An expired session should no longer be valid.
 *
 * Feature: rare-disease-platform, Property 16: Session management lifecycle
 * Validates: Requirements 8.1, 8.2
 */

import fc from "fast-check";

// ---------------------------------------------------------------------------
// In-memory Redis mock with TTL tracking
// ---------------------------------------------------------------------------

const store = new Map<string, { value: string; ttl?: number }>();

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    set: jest.fn(async (key: string, value: string, _ex?: string, ttl?: number) => {
      store.set(key, { value, ttl });
      return "OK";
    }),
    del: jest.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return count;
    }),
    expire: jest.fn(async (key: string, ttl: number) => {
      const entry = store.get(key);
      if (entry) {
        entry.ttl = ttl;
        store.set(key, entry);
        return 1;
      }
      return 0;
    }),
    scan: jest.fn(async () => ["0", []]),
  },
}));

import {
  createSession,
  getSession,
  invalidateSession,
  extendSession,
  SESSION_TTL,
} from "@/lib/cache";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const userIdArb = fc.stringMatching(/^[a-f0-9]{8}$/).map((s) => `user-${s}`);
const customTtlArb = fc.integer({ min: 60, max: 86400 });

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 16: Session management lifecycle", () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it(
    "for any user, createSession stores session with correct TTL and getSession retrieves it",
    async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          store.clear();
          jest.clearAllMocks();

          // Create session
          await createSession(userId);

          // Verify it was stored with the correct key and TTL
          const entry = store.get(`session:${userId}`);
          expect(entry).toBeDefined();
          expect(entry!.ttl).toBe(SESSION_TTL);

          // Verify the stored data is correct
          const parsed = JSON.parse(entry!.value);
          expect(parsed.userId).toBe(userId);
          expect(typeof parsed.createdAt).toBe("number");

          // Verify getSession retrieves matching data
          const session = await getSession(userId);
          expect(session).not.toBeNull();
          expect(session!.userId).toBe(userId);
        }),
        { numRuns: 5 }
      );
    },
    30000
  );

  it(
    "for any active session, extendSession updates the TTL",
    async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, customTtlArb, async (userId, newTtl) => {
          store.clear();
          jest.clearAllMocks();

          // Create session first
          await createSession(userId);
          const originalEntry = store.get(`session:${userId}`);
          expect(originalEntry).toBeDefined();

          // Extend with custom TTL
          await extendSession(userId, newTtl);

          // Verify TTL was updated
          const updatedEntry = store.get(`session:${userId}`);
          expect(updatedEntry).toBeDefined();
          expect(updatedEntry!.ttl).toBe(newTtl);
        }),
        { numRuns: 5 }
      );
    },
    30000
  );

  it(
    "for any session, invalidateSession removes it so getSession returns null",
    async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          store.clear();
          jest.clearAllMocks();

          // Create session
          await createSession(userId);
          expect(await getSession(userId)).not.toBeNull();

          // Invalidate (simulates expiration / logout)
          await invalidateSession(userId);

          // Session should no longer be valid
          const session = await getSession(userId);
          expect(session).toBeNull();
        }),
        { numRuns: 5 }
      );
    },
    30000
  );

  it(
    "extendSession with default TTL uses SESSION_TTL",
    async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          store.clear();
          jest.clearAllMocks();

          await createSession(userId);

          // Extend with default TTL
          await extendSession(userId);

          const entry = store.get(`session:${userId}`);
          expect(entry).toBeDefined();
          expect(entry!.ttl).toBe(SESSION_TTL);
        }),
        { numRuns: 5 }
      );
    },
    30000
  );
});
