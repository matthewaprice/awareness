jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  }));
});

describe("Redis client singleton", () => {
  it("exports a redis instance", async () => {
    const { redis } = await import("../redis");
    expect(redis).toBeDefined();
    expect(redis.get).toBeDefined();
    expect(redis.set).toBeDefined();
  });
});
