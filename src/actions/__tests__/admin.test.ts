// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    physicianProfile: {
      count: jest.fn(),
      update: jest.fn(),
    },
    surveyResponse: {
      count: jest.fn(),
    },
    survey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    surveyQuestion: {
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache", () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  invalidateCache: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn(),
}));

import {
  listUsers,
  updateUserStatus,
  updateUserRole,
  getDashboardMetrics,
  reviewPhysicianProfile,
  createSurvey,
  updateSurvey,
  publishSurvey,
  archiveSurvey,
} from "../admin";
import { prisma } from "@/lib/db";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import type { SurveyInput } from "@/types";

const validSurveyInput: SurveyInput = {
  title: "Symptom Survey",
  description: "A survey about symptoms",
  questions: [
    {
      questionText: "How are you feeling?",
      questionType: "TEXT",
      required: true,
      orderIndex: 0,
    },
  ],
};

describe("listUsers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns paginated users with default filters", async () => {
    const mockUsers = [
      {
        id: "u1",
        email: "test@example.com",
        fullName: "Test User",
        role: "PATIENT",
        active: true,
        emailVerified: true,
        createdAt: new Date(),
      },
    ];
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

    const result = await listUsers({ page: 1, pageSize: 10 });
    expect(result.data).toEqual(mockUsers);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("applies search filter", async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await listUsers({ search: "john", page: 1, pageSize: 10 });

    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ email: expect.any(Object) }),
                expect.objectContaining({ fullName: expect.any(Object) }),
              ]),
            }),
          ]),
        }),
      })
    );
  });

  it("applies role filter", async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await listUsers({ role: "PHYSICIAN", page: 1, pageSize: 10 });

    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: "PHYSICIAN" }),
      })
    );
  });

  it("returns empty result for invalid filters", async () => {
    const result = await listUsers({ page: -1, pageSize: 10 });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("updateUserStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates user active status", async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    await updateUserStatus("user-1", false);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { active: false },
    });
    expect(invalidateCache).toHaveBeenCalledWith("metrics:dashboard");
  });

  it("throws for empty userId", async () => {
    await expect(updateUserStatus("", true)).rejects.toThrow(
      "User ID is required"
    );
  });
});

describe("updateUserRole", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates user role", async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    await updateUserRole("user-1", "ADMIN");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: "ADMIN" },
    });
    expect(invalidateCache).toHaveBeenCalledWith("metrics:dashboard");
  });

  it("throws for empty userId", async () => {
    await expect(updateUserRole("", "ADMIN")).rejects.toThrow(
      "User ID is required"
    );
  });
});

describe("getDashboardMetrics", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns cached metrics when available", async () => {
    const cachedMetrics = {
      totalUsers: 100,
      totalPatients: 70,
      totalPhysicians: 25,
      surveyCompletionCount: 200,
      activePhysicianProfiles: 20,
    };
    (getCached as jest.Mock).mockResolvedValue(cachedMetrics);

    const result = await getDashboardMetrics();
    expect(result).toEqual(cachedMetrics);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it("queries DB on cache miss and caches result", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.user.count as jest.Mock)
      .mockResolvedValueOnce(100) // totalUsers
      .mockResolvedValueOnce(70) // totalPatients
      .mockResolvedValueOnce(25); // totalPhysicians
    (prisma.surveyResponse.count as jest.Mock).mockResolvedValue(200);
    (prisma.physicianProfile.count as jest.Mock).mockResolvedValue(20);

    const result = await getDashboardMetrics();

    expect(result).toEqual({
      totalUsers: 100,
      totalPatients: 70,
      totalPhysicians: 25,
      surveyCompletionCount: 200,
      activePhysicianProfiles: 20,
    });
    expect(setCached).toHaveBeenCalledWith(
      "metrics:dashboard",
      result,
      300
    );
  });
});

describe("reviewPhysicianProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("approves a physician profile", async () => {
    (prisma.physicianProfile.update as jest.Mock).mockResolvedValue({ userId: "user-1" });

    await reviewPhysicianProfile("profile-1", true);

    expect(prisma.physicianProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { approved: true },
    });
    expect(invalidateCache).toHaveBeenCalledWith("physician-search:*");
    expect(invalidateCache).toHaveBeenCalledWith("metrics:dashboard");
  });

  it("rejects a physician profile", async () => {
    (prisma.physicianProfile.update as jest.Mock).mockResolvedValue({ userId: "user-1" });

    await reviewPhysicianProfile("profile-1", false);

    expect(prisma.physicianProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { approved: false },
    });
  });

  it("throws for empty profileId", async () => {
    await expect(reviewPhysicianProfile("", true)).rejects.toThrow(
      "Profile ID is required"
    );
  });
});

describe("createSurvey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a survey with questions", async () => {
    (prisma.survey.create as jest.Mock).mockResolvedValue({ id: "survey-1" });

    const result = await createSurvey(validSurveyInput);

    expect(result).toEqual({ success: true, surveyId: "survey-1" });
    expect(prisma.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Symptom Survey",
        description: "A survey about symptoms",
        status: "DRAFT",
        questions: {
          create: [
            expect.objectContaining({
              questionText: "How are you feeling?",
              questionType: "TEXT",
              required: true,
              orderIndex: 0,
            }),
          ],
        },
      }),
    });
  });

  it("returns validation errors for empty title", async () => {
    const result = await createSurvey({
      title: "",
      description: "",
      questions: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("updateSurvey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns error for empty surveyId", async () => {
    const result = await updateSurvey("", validSurveyInput);
    expect(result.success).toBe(false);
  });

  it("returns error when survey not found", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await updateSurvey("survey-1", validSurveyInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].message).toBe("Survey not found");
    }
  });

  it("returns error when survey is not in DRAFT status", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue({
      status: "PUBLISHED",
    });

    const result = await updateSurvey("survey-1", validSurveyInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].message).toBe(
        "Only draft surveys can be edited"
      );
    }
  });

  it("updates a draft survey", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue({
      status: "DRAFT",
    });
    (prisma.surveyQuestion.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.survey.update as jest.Mock).mockResolvedValue({});

    const result = await updateSurvey("survey-1", validSurveyInput);
    expect(result).toEqual({ success: true });
    expect(prisma.surveyQuestion.deleteMany).toHaveBeenCalledWith({
      where: { surveyId: "survey-1" },
    });
  });
});

describe("publishSurvey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("publishes a survey", async () => {
    (prisma.survey.update as jest.Mock).mockResolvedValue({});

    await publishSurvey("survey-1");

    expect(prisma.survey.update).toHaveBeenCalledWith({
      where: { id: "survey-1" },
      data: {
        status: "PUBLISHED",
        publishedAt: expect.any(Date),
      },
    });
  });

  it("throws for empty surveyId", async () => {
    await expect(publishSurvey("")).rejects.toThrow("Survey ID is required");
  });
});

describe("archiveSurvey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("archives a survey", async () => {
    (prisma.survey.update as jest.Mock).mockResolvedValue({});

    await archiveSurvey("survey-1");

    expect(prisma.survey.update).toHaveBeenCalledWith({
      where: { id: "survey-1" },
      data: { status: "ARCHIVED" },
    });
  });

  it("throws for empty surveyId", async () => {
    await expect(archiveSurvey("")).rejects.toThrow("Survey ID is required");
  });
});
