import { redis } from "./redis";

/** Default session TTL in seconds (30 minutes), configurable via SESSION_TTL env var */
export const SESSION_TTL = parseInt(process.env.SESSION_TTL ?? "1800", 10);

/**
 * Create a session entry in Redis for the given user ID.
 * Stores basic metadata (createdAt) with the configured TTL.
 */
export async function createSession(userId: string): Promise<void> {
  const data = { userId, createdAt: Date.now() };
  await redis.set(`session:${userId}`, JSON.stringify(data), "EX", SESSION_TTL);
}

/**
 * Retrieve a session entry from Redis for the given user ID.
 * Returns null if the session does not exist (expired or never created).
 */
export async function getSession(userId: string): Promise<{ userId: string; createdAt: number } | null> {
  const raw = await redis.get(`session:${userId}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as { userId: string; createdAt: number };
  } catch {
    return null;
  }
}

/**
 * Invalidate (delete) a session entry in Redis for the given user ID.
 */
export async function invalidateSession(userId: string): Promise<void> {
  await redis.del(`session:${userId}`);
}

/**
 * Retrieve a cached value by key.
 * Returns null on cache miss or parse failure.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Store a value in cache with a TTL in seconds.
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
}

/**
 * Invalidate cache entries matching a pattern.
 * Uses SCAN to avoid blocking Redis on large key spaces.
 */
export async function invalidateCache(pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

/**
 * Extend a session's TTL by the given number of seconds (default SESSION_TTL).
 */
export async function extendSession(
  sessionId: string,
  ttlSeconds: number = SESSION_TTL
): Promise<void> {
  await redis.expire(`session:${sessionId}`, ttlSeconds);
}
