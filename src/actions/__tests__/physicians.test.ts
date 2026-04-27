// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  prisma: {
    physicianProfile: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache", () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  invalidateCache: jest.fn(),
}));

import {
  createOrUpdateProfile,
  getPhysicianProfile,
  toggleProfileVisibility,
  searchPhysicians,
} from "../physicians";
import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import type { PhysicianProfileInput, PhysicianSearchQuery } from "@/types";

const validProfile: PhysicianProfileInput = {
  credentials: "MD, PhD",
  specialty: "Rare Disease Specialist",
  practiceName: "City Medical Center",
  practiceAddress: "123 Main St",
  city: "Boston",
  state: "MA",
  zipCode: "02101",
  phone: "555-123-4567",
  website: "https://example.com",
};

describe("createOrUpdateProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns error when userId is empty", async () => {
    const result = await createOrUpdateProfile("", validProfile);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      { field: "userId", message: "User ID is required" },
    ]);
  });

  it("returns validation errors for invalid input", async () => {
    const result = await createOrUpdateProfile("user-1", {
      credentials: "",
      specialty: "",
      practiceName: "",
      practiceAddress: "",
      city: "",
      state: "",
      zipCode: "",
      phone: "",
    });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    // Each empty required field should produce an error
    const fields = result.errors!.map((e) => e.field);
    expect(fields).toContain("credentials");
    expect(fields).toContain("specialty");
  });

  it("returns validation error for invalid website URL", async () => {
    const result = await createOrUpdateProfile("user-1", {
      ...validProfile,
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.field === "website")).toBe(true);
  });

  it("upserts profile and invalidates cache on success", async () => {
    (prisma.physicianProfile.upsert as jest.Mock).mockResolvedValue({
      id: "profile-1",
    });

    const result = await createOrUpdateProfile("user-1", validProfile);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(prisma.physicianProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        create: expect.objectContaining({
          userId: "user-1",
          credentials: validProfile.credentials,
          specialty: validProfile.specialty,
        }),
        update: expect.objectContaining({
          credentials: validProfile.credentials,
          specialty: validProfile.specialty,
        }),
      })
    );
    expect(invalidateCache).toHaveBeenCalledWith("physician-search:*");
  });

  it("handles profile without optional website", async () => {
    const profileNoWebsite = { ...validProfile };
    delete (profileNoWebsite as Record<string, unknown>).website;

    (prisma.physicianProfile.upsert as jest.Mock).mockResolvedValue({
      id: "profile-1",
    });

    const result = await createOrUpdateProfile("user-1", profileNoWebsite);
    expect(result.success).toBe(true);
    expect(prisma.physicianProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ website: null }),
        update: expect.objectContaining({ website: null }),
      })
    );
  });
});

describe("getPhysicianProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null for empty physicianId", async () => {
    const result = await getPhysicianProfile("");
    expect(result).toBeNull();
    expect(prisma.physicianProfile.findUnique).not.toHaveBeenCalled();
  });

  it("returns profile with user data", async () => {
    const mockProfile = {
      id: "profile-1",
      userId: "user-1",
      ...validProfile,
      active: true,
      approved: false,
      user: { fullName: "Dr. Smith", email: "smith@example.com" },
    };
    (prisma.physicianProfile.findUnique as jest.Mock).mockResolvedValue(
      mockProfile
    );

    const result = await getPhysicianProfile("user-1");
    expect(result).toEqual(mockProfile);
    expect(prisma.physicianProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        include: { user: { select: { fullName: true, email: true } } },
      })
    );
  });

  it("returns null when profile not found", async () => {
    (prisma.physicianProfile.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getPhysicianProfile("non-existent");
    expect(result).toBeNull();
  });
});

describe("toggleProfileVisibility", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates active status and invalidates cache", async () => {
    (prisma.physicianProfile.update as jest.Mock).mockResolvedValue({});

    await toggleProfileVisibility("user-1", false);

    expect(prisma.physicianProfile.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { active: false },
    });
    expect(invalidateCache).toHaveBeenCalledWith("physician-search:*");
  });

  it("can set active to true", async () => {
    (prisma.physicianProfile.update as jest.Mock).mockResolvedValue({});

    await toggleProfileVisibility("user-1", true);

    expect(prisma.physicianProfile.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { active: true },
    });
  });
});

describe("searchPhysicians", () => {
  beforeEach(() => jest.clearAllMocks());

  const baseQuery: PhysicianSearchQuery = {
    page: 1,
    pageSize: 10,
  };

  it("returns cached results when available", async () => {
    const cachedResult = {
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
    (getCached as jest.Mock).mockResolvedValue(cachedResult);

    const result = await searchPhysicians(baseQuery);
    expect(result).toEqual(cachedResult);
    expect(prisma.physicianProfile.count).not.toHaveBeenCalled();
    expect(prisma.physicianProfile.findMany).not.toHaveBeenCalled();
  });

  it("queries database on cache miss and caches result", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.physicianProfile.count as jest.Mock).mockResolvedValue(1);
    (prisma.physicianProfile.findMany as jest.Mock).mockResolvedValue([
      {
        id: "p1",
        userId: "u1",
        ...validProfile,
        active: true,
        approved: true,
        user: { fullName: "Dr. Smith", email: "smith@example.com" },
      },
    ]);

    const result = await searchPhysicians(baseQuery);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.totalPages).toBe(1);
    expect(setCached).toHaveBeenCalledWith(
      expect.stringContaining("physician-search:"),
      result,
      300
    );
  });

  it("filters by location (city/state/zipCode)", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.physicianProfile.count as jest.Mock).mockResolvedValue(0);
    (prisma.physicianProfile.findMany as jest.Mock).mockResolvedValue([]);

    await searchPhysicians({ ...baseQuery, location: "Boston" });

    expect(prisma.physicianProfile.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          approved: true,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { city: { contains: "Boston", mode: "insensitive" } },
                { state: { contains: "Boston", mode: "insensitive" } },
                { zipCode: { contains: "Boston", mode: "insensitive" } },
              ],
            }),
          ]),
        }),
      })
    );
  });

  it("filters by name (practiceName or user fullName)", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.physicianProfile.count as jest.Mock).mockResolvedValue(0);
    (prisma.physicianProfile.findMany as jest.Mock).mockResolvedValue([]);

    await searchPhysicians({ ...baseQuery, name: "Smith" });

    expect(prisma.physicianProfile.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { practiceName: { contains: "Smith", mode: "insensitive" } },
                {
                  user: {
                    fullName: { contains: "Smith", mode: "insensitive" },
                  },
                },
              ],
            }),
          ]),
        }),
      })
    );
  });

  it("filters by specialty", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.physicianProfile.count as jest.Mock).mockResolvedValue(0);
    (prisma.physicianProfile.findMany as jest.Mock).mockResolvedValue([]);

    await searchPhysicians({ ...baseQuery, specialty: "Cardiology" });

    expect(prisma.physicianProfile.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { specialty: { contains: "Cardiology", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });

  it("returns empty result for invalid query", async () => {
    const result = await searchPhysicians({
      page: -1,
      pageSize: 10,
    } as PhysicianSearchQuery);
    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
  });

  it("calculates pagination correctly", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.physicianProfile.count as jest.Mock).mockResolvedValue(25);
    (prisma.physicianProfile.findMany as jest.Mock).mockResolvedValue([]);

    const result = await searchPhysicians({ page: 2, pageSize: 10 });
    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(prisma.physicianProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    );
  });
});
