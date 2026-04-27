jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../../../prisma/generated/client/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    user: {},
  })),
}));

describe("Prisma client singleton", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  });

  it("exports a prisma instance", async () => {
    const { prisma } = await import("../db");
    expect(prisma).toBeDefined();
  });
});
