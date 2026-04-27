// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  prisma: {
    responseAnswer: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    surveyResponse: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    surveyQuestion: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache", () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
}));

import {
  getAggregatedSymptomData,
  getPublicStatistics,
} from "../aggregation";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/cache";

describe("getAggregatedSymptomData", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns cached data when available", async () => {
    const cached = [{ questionText: "Pain?", questionType: "SCALE", answer: "5", count: 10 }];
    (getCached as jest.Mock).mockResolvedValue(cached);

    const result = await getAggregatedSymptomData();
    expect(result).toEqual(cached);
    expect(prisma.responseAnswer.findMany).not.toHaveBeenCalled();
  });

  it("queries DB and groups answers when cache is empty", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([
      { answer: "severe", question: { questionText: "Pain level?", questionType: "SCALE" } },
      { answer: "severe", question: { questionText: "Pain level?", questionType: "SCALE" } },
      { answer: "mild", question: { questionText: "Pain level?", questionType: "SCALE" } },
    ]);

    const result = await getAggregatedSymptomData();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      questionText: "Pain level?",
      questionType: "SCALE",
      answer: "severe",
      count: 2,
    });
    expect(result[1]).toEqual({
      questionText: "Pain level?",
      questionType: "SCALE",
      answer: "mild",
      count: 1,
    });
    expect(setCached).toHaveBeenCalled();
  });

  it("filters by symptomType (question text)", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([]);

    await getAggregatedSymptomData({ symptomType: "headache" });

    expect(prisma.responseAnswer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          question: { questionText: { contains: "headache", mode: "insensitive" } },
        }),
      })
    );
  });

  it("filters by date range", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([]);

    const dateFrom = new Date("2024-01-01");
    const dateTo = new Date("2024-12-31");
    await getAggregatedSymptomData({ dateFrom, dateTo });

    expect(prisma.responseAnswer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          response: { submittedAt: { gte: dateFrom, lte: dateTo } },
        }),
      })
    );
  });

  it("filters by severity in answer values", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([
      { answer: "severe pain", question: { questionText: "Pain?", questionType: "TEXT" } },
      { answer: "mild discomfort", question: { questionText: "Pain?", questionType: "TEXT" } },
    ]);

    const result = await getAggregatedSymptomData({ severity: "severe" });
    expect(result).toHaveLength(1);
    expect(result[0].answer).toBe("severe pain");
  });

  it("filters by frequency in answer values", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([
      { answer: "daily", question: { questionText: "Frequency?", questionType: "SINGLE_CHOICE" } },
      { answer: "weekly", question: { questionText: "Frequency?", questionType: "SINGLE_CHOICE" } },
    ]);

    const result = await getAggregatedSymptomData({ frequency: "daily" });
    expect(result).toHaveLength(1);
    expect(result[0].answer).toBe("daily");
  });

  it("returns no PII fields in results", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([
      { answer: "yes", question: { questionText: "Fatigue?", questionType: "TEXT" } },
    ]);

    const result = await getAggregatedSymptomData();
    for (const row of result) {
      expect(row).not.toHaveProperty("patientId");
      expect(row).not.toHaveProperty("email");
      expect(row).not.toHaveProperty("fullName");
      expect(row).not.toHaveProperty("userId");
    }
  });
});

describe("getPublicStatistics", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns cached statistics when available", async () => {
    const cached = {
      totalResponses: 100,
      totalQuestions: 20,
      topSymptoms: [],
      severityDistribution: [],
      responsesByMonth: [],
    };
    (getCached as jest.Mock).mockResolvedValue(cached);

    const result = await getPublicStatistics();
    expect(result).toEqual(cached);
    expect(prisma.surveyResponse.count).not.toHaveBeenCalled();
  });

  it("computes statistics from DB when cache is empty", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.surveyResponse.count as jest.Mock).mockResolvedValue(50);
    (prisma.surveyQuestion.count as jest.Mock).mockResolvedValue(10);
    (prisma.responseAnswer.groupBy as jest.Mock).mockResolvedValue([
      { questionId: "q1", _count: { id: 30 } },
      { questionId: "q2", _count: { id: 20 } },
    ]);
    (prisma.surveyQuestion.findMany as jest.Mock).mockResolvedValue([
      { id: "q1", questionText: "Pain level?" },
      { id: "q2", questionText: "Fatigue?" },
    ]);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([
      { answer: "severe" },
      { answer: "severe" },
      { answer: "mild" },
    ]);
    (prisma.surveyResponse.findMany as jest.Mock).mockResolvedValue([
      { submittedAt: new Date("2024-03-15") },
      { submittedAt: new Date("2024-03-20") },
      { submittedAt: new Date("2024-04-10") },
    ]);

    const result = await getPublicStatistics();

    expect(result.totalResponses).toBe(50);
    expect(result.totalQuestions).toBe(10);
    expect(result.topSymptoms).toHaveLength(2);
    expect(result.topSymptoms[0].questionText).toBe("Pain level?");
    expect(result.topSymptoms[0].responseCount).toBe(30);
    expect(result.severityDistribution.length).toBeGreaterThan(0);
    expect(result.responsesByMonth).toHaveLength(2);
    expect(setCached).toHaveBeenCalledWith(
      "aggregation:public-statistics",
      result,
      15 * 60
    );
  });

  it("returns no PII in statistics output", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.surveyResponse.count as jest.Mock).mockResolvedValue(0);
    (prisma.surveyQuestion.count as jest.Mock).mockResolvedValue(0);
    (prisma.responseAnswer.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.surveyQuestion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.surveyResponse.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getPublicStatistics();

    // Verify the result object contains no PII fields
    const json = JSON.stringify(result);
    expect(json).not.toContain("patientId");
    expect(json).not.toContain("email");
    expect(json).not.toContain("fullName");
    expect(json).not.toContain("passwordHash");

    // Verify structure
    expect(result).toHaveProperty("totalResponses");
    expect(result).toHaveProperty("totalQuestions");
    expect(result).toHaveProperty("topSymptoms");
    expect(result).toHaveProperty("severityDistribution");
    expect(result).toHaveProperty("responsesByMonth");
  });

  it("handles empty database gracefully", async () => {
    (getCached as jest.Mock).mockResolvedValue(null);
    (prisma.surveyResponse.count as jest.Mock).mockResolvedValue(0);
    (prisma.surveyQuestion.count as jest.Mock).mockResolvedValue(0);
    (prisma.responseAnswer.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.surveyQuestion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.responseAnswer.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.surveyResponse.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getPublicStatistics();
    expect(result.totalResponses).toBe(0);
    expect(result.totalQuestions).toBe(0);
    expect(result.topSymptoms).toEqual([]);
    expect(result.severityDistribution).toEqual([]);
    expect(result.responsesByMonth).toEqual([]);
  });
});
