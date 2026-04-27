import {
  getCached,
  setCached,
  invalidateCache,
  extendSession,
  createSession,
  getSession,
  invalidateSession,
  SESSION_TTL,
} from "../cache";
import { redis } from "../redis";

jest.mock("../redis", () => {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
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
      scan: jest.fn(async (_cursor: string, _match: string, pattern: string) => {
        const matched = [...store.keys()].filter((k) => {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
          return regex.test(k);
        });
        return ["0", matched];
      }),
      expire: jest.fn(async () => 1),
      _store: store,
    },
  };
});

const store = (redis as unknown as { _store: Map<string, { value: string; ttl?: number }> })._store;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

describe("getCached", () => {
  it("returns null on cache miss", async () => {
    expect(await getCached("nonexistent")).toBeNull();
  });

  it("returns parsed value on cache hit", async () => {
    store.set("content:about", { value: JSON.stringify({ title: "About" }) });
    const result = await getCached<{ title: string }>("content:about");
    expect(result).toEqual({ title: "About" });
  });

  it("returns null for invalid JSON", async () => {
    store.set("bad", { value: "not-json{" });
    expect(await getCached("bad")).toBeNull();
  });
});

describe("setCached", () => {
  it("stores serialized value with TTL", async () => {
    await setCached("metrics:dashboard", { total: 42 }, 300);
    expect(redis.set).toHaveBeenCalledWith(
      "metrics:dashboard",
      JSON.stringify({ total: 42 }),
      "EX",
      300
    );
  });
});

describe("invalidateCache", () => {
  it("deletes keys matching pattern", async () => {
    store.set("physician-search:abc", { value: "{}" });
    store.set("physician-search:def", { value: "{}" });
    store.set("content:about", { value: "{}" });

    await invalidateCache("physician-search:*");

    expect(redis.del).toHaveBeenCalledWith("physician-search:abc", "physician-search:def");
  });

  it("does nothing when no keys match", async () => {
    await invalidateCache("nonexistent:*");
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe("extendSession", () => {
  it("calls expire with session key and default TTL", async () => {
    await extendSession("sess123");
    expect(redis.expire).toHaveBeenCalledWith("session:sess123", 1800);
  });

  it("accepts custom TTL", async () => {
    await extendSession("sess456", 3600);
    expect(redis.expire).toHaveBeenCalledWith("session:sess456", 3600);
  });
});

describe("SESSION_TTL", () => {
  it("defaults to 1800 seconds (30 minutes)", () => {
    expect(SESSION_TTL).toBe(1800);
  });
});

describe("createSession", () => {
  it("stores session data in Redis with configured TTL", async () => {
    const before = Date.now();
    await createSession("user-123");

    expect(redis.set).toHaveBeenCalledWith(
      "session:user-123",
      expect.any(String),
      "EX",
      SESSION_TTL
    );

    // Verify the stored data shape
    const storedValue = store.get("session:user-123")?.value;
    expect(storedValue).toBeDefined();
    const parsed = JSON.parse(storedValue!);
    expect(parsed.userId).toBe("user-123");
    expect(parsed.createdAt).toBeGreaterThanOrEqual(before);
    expect(parsed.createdAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("getSession", () => {
  it("returns null when session does not exist", async () => {
    const result = await getSession("nonexistent");
    expect(result).toBeNull();
  });

  it("returns session data when session exists", async () => {
    const data = { userId: "user-456", createdAt: Date.now() };
    store.set("session:user-456", { value: JSON.stringify(data) });

    const result = await getSession("user-456");
    expect(result).toEqual(data);
  });

  it("returns null for corrupted session data", async () => {
    store.set("session:bad-user", { value: "not-valid-json{" });
    const result = await getSession("bad-user");
    expect(result).toBeNull();
  });
});

describe("invalidateSession", () => {
  it("deletes the session key from Redis", async () => {
    store.set("session:user-789", { value: JSON.stringify({ userId: "user-789", createdAt: Date.now() }) });

    await invalidateSession("user-789");

    expect(redis.del).toHaveBeenCalledWith("session:user-789");
  });
});
