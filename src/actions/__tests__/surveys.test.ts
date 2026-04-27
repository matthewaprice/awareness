// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  prisma: {
    survey: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    surveyQuestion: {
      findMany: jest.fn(),
    },
    surveyResponse: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache", () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  invalidateCache: jest.fn(),
}));

import {
  getAvailableSurveys,
  getSurveyById,
  submitSurveyResponse,
  saveSurveyDraft,
  getSurveyDraft,
  getSurveyResponses,
  getSurveyResponseById,
} from "../surveys";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/cache";
import type { SurveySubmission, SurveyDraft } from "@/types";

describe("getAvailableSurveys", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty array for empty patientId", async () => {
    const result = await getAvailableSurveys("");
    expect(result).toEqual([]);
    expect(prisma.survey.findMany).not.toHaveBeenCalled();
  });

  it("returns published surveys", async () => {
    const mockSurveys = [
      { id: "s1", title: "Survey 1", description: "Desc", version: 1, status: "PUBLISHED", createdAt: new Date(), publishedAt: new Date() },
    ];
    (prisma.survey.findMany as jest.Mock).mockResolvedValue(mockSurveys);

    const result = await getAvailableSurveys("patient-1");
    expect(result).toEqual(mockSurveys);
    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PUBLISHED" } })
    );
  });
});

describe("getSurveyById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null for empty surveyId", async () => {
    const result = await getSurveyById("");
    expect(result).toBeNull();
  });

  it("returns survey with questions", async () => {
    const mockSurvey = {
      id: "s1",
      title: "Survey 1",
      description: "Desc",
      version: 1,
      status: "PUBLISHED",
      questions: [{ id: "q1", questionText: "How are you?", orderIndex: 0 }],
    };
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue(mockSurvey);

    const result = await getSurveyById("s1");
    expect(result).toEqual(mockSurvey);
    expect(prisma.survey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        include: { questions: { orderBy: { orderIndex: "asc" } } },
      })
    );
  });
});

describe("submitSurveyResponse", () => {
  beforeEach(() => jest.clearAllMocks());

  // Valid v4 UUIDs for Zod validation
  const surveyUuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const patientUuid = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
  const questionUuid = "c3d4e5f6-a7b8-4c9d-ae0f-1a2b3c4d5e6f";
  const questionUuid2 = "d4e5f6a7-b8c9-4dae-8f1a-2b3c4d5e6f7a";

  const validSubmission: SurveySubmission = {
    surveyId: surveyUuid,
    patientId: patientUuid,
    responses: [
      { questionId: questionUuid, answer: "Yes" },
    ],
  };

  it("returns errors for invalid input (bad UUIDs)", async () => {
    const result = await submitSurveyResponse({
      surveyId: "bad",
      patientId: "bad",
      responses: [],
    });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("returns error when survey not found", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await submitSurveyResponse(validSubmission);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      { field: "surveyId", message: "Survey not found" },
    ]);
  });

  it("returns error when survey is not published", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue({
      id: validSubmission.surveyId,
      version: 1,
      status: "DRAFT",
    });

    const result = await submitSurveyResponse(validSubmission);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      { field: "surveyId", message: "Survey is not available for submission" },
    ]);
  });

  it("returns error for missing required questions", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue({
      id: validSubmission.surveyId,
      version: 1,
      status: "PUBLISHED",
    });
    (prisma.surveyQuestion.findMany as jest.Mock).mockResolvedValue([
      { id: questionUuid, required: true },
      { id: questionUuid2, required: true },
    ]);

    const result = await submitSurveyResponse(validSubmission);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      { field: `responses.${questionUuid2}`, message: "This question is required" },
    ]);
  });

  it("creates response record on valid submission", async () => {
    (prisma.survey.findUnique as jest.Mock).mockResolvedValue({
      id: validSubmission.surveyId,
      version: 2,
      status: "PUBLISHED",
    });
    (prisma.surveyQuestion.findMany as jest.Mock).mockResolvedValue([
      { id: questionUuid, required: true },
    ]);
    (prisma.surveyResponse.create as jest.Mock).mockResolvedValue({ id: "resp-1" });

    const result = await submitSurveyResponse(validSubmission);
    expect(result.success).toBe(true);
    expect(prisma.surveyResponse.create).toHaveBeenCalledWith({
      data: {
        surveyId: validSubmission.surveyId,
        patientId: validSubmission.patientId,
        surveyVersion: 2,
        answers: {
          create: [
            {
              question: { connect: { id: questionUuid } },
              answer: "Yes",
            },
          ],
        },
      },
    });
  });
});

describe("saveSurveyDraft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves draft to Redis with correct key and TTL", async () => {
    const draft: SurveyDraft = {
      surveyId: "s1",
      patientId: "p1",
      responses: [{ questionId: "q1", answer: "partial" }],
      lastSavedAt: new Date("2024-01-01"),
    };

    await saveSurveyDraft(draft);

    expect(setCached).toHaveBeenCalledWith(
      "survey-draft:p1:s1",
      draft,
      7 * 24 * 60 * 60
    );
  });
});

describe("getSurveyDraft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns draft from Redis", async () => {
    const draft: SurveyDraft = {
      surveyId: "s1",
      patientId: "p1",
      responses: [{ questionId: "q1", answer: "partial" }],
      lastSavedAt: new Date("2024-01-01"),
    };
    (getCached as jest.Mock).mockResolvedValue(draft);

    const result = await getSurveyDraft("p1", "s1");
    expect(result).toEqual(draft);
    expect(getCached).toHaveBeenCalledWith("survey-draft:p1:s1");
  });

  it("returns null when no draft exists", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);

    const result = await getSurveyDraft("p1", "s1");
    expect(result).toBeNull();
  });
});

describe("getSurveyResponses", () => {
  beforeEach(() => jest.clearAllMocks());

  const patientSession = { id: "patient-1", role: "PATIENT" };
  const adminSession = { id: "admin-1", role: "ADMIN" };
  const otherPatientSession = { id: "patient-2", role: "PATIENT" };

  const mockResponses = [
    { id: "r1", surveyId: "s1", patientId: "patient-1", surveyVersion: 1, submittedAt: new Date(), answers: [], survey: {} },
  ];

  it("allows a patient to access their own responses", async () => {
    (prisma.surveyResponse.findMany as jest.Mock).mockResolvedValue(mockResponses);

    const result = await getSurveyResponses(patientSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockResponses);
    }
    expect(prisma.surveyResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "patient-1" } })
    );
  });

  it("allows a patient to access own responses when targetPatientId matches", async () => {
    (prisma.surveyResponse.findMany as jest.Mock).mockResolvedValue(mockResponses);

    const result = await getSurveyResponses(patientSession, "patient-1");
    expect(result.success).toBe(true);
  });

  it("denies a patient access to another patient's responses", async () => {
    const result = await getSurveyResponses(otherPatientSession, "patient-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Forbidden");
    }
    expect(prisma.surveyResponse.findMany).not.toHaveBeenCalled();
  });

  it("allows an admin to access any patient's responses", async () => {
    (prisma.surveyResponse.findMany as jest.Mock).mockResolvedValue(mockResponses);

    const result = await getSurveyResponses(adminSession, "patient-1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockResponses);
    }
  });

  it("denies access for non-patient non-admin roles", async () => {
    const physicianSession = { id: "doc-1", role: "PHYSICIAN" };
    const result = await getSurveyResponses(physicianSession, "patient-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Forbidden");
    }
  });
});

describe("getSurveyResponseById", () => {
  beforeEach(() => jest.clearAllMocks());

  const patientSession = { id: "patient-1", role: "PATIENT" };
  const adminSession = { id: "admin-1", role: "ADMIN" };
  const otherPatientSession = { id: "patient-2", role: "PATIENT" };

  const mockResponse = {
    id: "r1",
    surveyId: "s1",
    patientId: "patient-1",
    surveyVersion: 1,
    submittedAt: new Date(),
    answers: [],
    survey: {},
  };

  it("returns error for empty responseId", async () => {
    const result = await getSurveyResponseById(patientSession, "");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Response ID is required");
    }
  });

  it("returns not found for non-existent response", async () => {
    (prisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getSurveyResponseById(patientSession, "non-existent");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Not found");
    }
  });

  it("allows a patient to access their own response", async () => {
    (prisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getSurveyResponseById(patientSession, "r1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockResponse);
    }
  });

  it("denies a patient access to another patient's response", async () => {
    (prisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getSurveyResponseById(otherPatientSession, "r1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Forbidden");
    }
  });

  it("allows an admin to access any patient's response", async () => {
    (prisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getSurveyResponseById(adminSession, "r1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockResponse);
    }
  });

  it("denies access for non-patient non-admin roles", async () => {
    const physicianSession = { id: "doc-1", role: "PHYSICIAN" };
    (prisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getSurveyResponseById(physicianSession, "r1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Forbidden");
    }
  });
});
