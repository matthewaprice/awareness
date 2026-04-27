"use server";

import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/cache";

/** Cache TTL for aggregated statistics: 15 minutes */
const STATS_CACHE_TTL = 15 * 60;

/**
 * Filter criteria for querying aggregated symptom data.
 * All fields are optional — omitted fields are not filtered.
 * Requirements: 3.2
 */
export interface AggregationFilters {
  /** Filter by symptom type (matches question text via substring, case-insensitive) */
  symptomType?: string;
  /** Filter by severity value in answers (e.g. "mild", "moderate", "severe") */
  severity?: string;
  /** Filter by frequency value in answers (e.g. "daily", "weekly", "monthly") */
  frequency?: string;
  /** Filter responses submitted on or after this date */
  dateFrom?: Date;
  /** Filter responses submitted on or before this date */
  dateTo?: Date;
}

/**
 * A single row in the aggregated query result.
 * Contains NO patient identifiers — only question text, answer value, and count.
 * Requirements: 3.2, 3.3
 */
export interface AggregatedSymptomRow {
  questionText: string;
  questionType: string;
  answer: unknown;
  count: number;
}

/**
 * Query aggregated symptom data with optional filters.
 *
 * Joins SurveyResponse → ResponseAnswer → SurveyQuestion to produce
 * de-identified counts grouped by question and answer value.
 *
 * The output deliberately excludes patient IDs, emails, names, or any PII.
 *
 * Requirements: 3.2
 */
export async function getAggregatedSymptomData(
  filters: AggregationFilters = {}
): Promise<AggregatedSymptomRow[]> {
  const cacheKey = `aggregation:symptoms:${JSON.stringify(filters)}`;
  const cached = await getCached<AggregatedSymptomRow[]>(cacheKey);
  if (cached) return cached;

  // Build the where clause for SurveyResponse (date range filtering)
  const responseWhere: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    const submittedAt: Record<string, Date> = {};
    if (filters.dateFrom) submittedAt.gte = filters.dateFrom;
    if (filters.dateTo) submittedAt.lte = filters.dateTo;
    responseWhere.submittedAt = submittedAt;
  }

  // Build the where clause for SurveyQuestion (symptom type filtering)
  const questionWhere: Record<string, unknown> = {};
  if (filters.symptomType) {
    questionWhere.questionText = {
      contains: filters.symptomType,
      mode: "insensitive",
    };
  }

  // Fetch answers with related question and response data
  // Select ONLY non-PII fields — no patientId, no user relations
  const answers = await prisma.responseAnswer.findMany({
    where: {
      question: Object.keys(questionWhere).length > 0 ? questionWhere : undefined,
      response: Object.keys(responseWhere).length > 0 ? responseWhere : undefined,
    },
    select: {
      answer: true,
      question: {
        select: {
          questionText: true,
          questionType: true,
        },
      },
    },
  });

  // Group by question text + answer value and count occurrences
  const grouped = new Map<string, AggregatedSymptomRow>();

  for (const row of answers) {
    const answerValue = typeof row.answer === "string" ? row.answer : JSON.stringify(row.answer);

    // Apply severity filter (answer value contains severity keyword)
    if (filters.severity) {
      const lower = answerValue.toLowerCase();
      if (!lower.includes(filters.severity.toLowerCase())) continue;
    }

    // Apply frequency filter (answer value contains frequency keyword)
    if (filters.frequency) {
      const lower = answerValue.toLowerCase();
      if (!lower.includes(filters.frequency.toLowerCase())) continue;
    }

    const key = `${row.question.questionText}::${answerValue}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, {
        questionText: row.question.questionText,
        questionType: row.question.questionType,
        answer: row.answer,
        count: 1,
      });
    }
  }

  const result = Array.from(grouped.values()).sort((a, b) => b.count - a.count);

  await setCached(cacheKey, result, STATS_CACHE_TTL);
  return result;
}


/**
 * Summary statistics for the public-facing page.
 * Contains ONLY counts and percentages — no PII whatsoever.
 * Requirements: 3.3
 */
export interface PublicStatistics {
  totalResponses: number;
  totalQuestions: number;
  /** Top symptoms by response count */
  topSymptoms: { questionText: string; responseCount: number }[];
  /** Distribution of answer values for SCALE / SINGLE_CHOICE questions (severity-like) */
  severityDistribution: { label: string; count: number; percentage: number }[];
  /** Responses over time (month buckets) */
  responsesByMonth: { month: string; count: number }[];
}

/**
 * Get de-identified, aggregated statistics for the public statistics page.
 *
 * This function returns ONLY counts, percentages, and statistical summaries.
 * No patient IDs, emails, names, or any PII is included in the output.
 *
 * Results are cached in Redis for performance.
 *
 * Requirements: 3.3
 */
export async function getPublicStatistics(): Promise<PublicStatistics> {
  const cacheKey = "aggregation:public-statistics";
  const cached = await getCached<PublicStatistics>(cacheKey);
  if (cached) return cached;

  // Total survey responses (count only)
  const totalResponses = await prisma.surveyResponse.count();

  // Total unique questions across published surveys
  const totalQuestions = await prisma.surveyQuestion.count({
    where: { survey: { status: "PUBLISHED" } },
  });

  // Top symptoms: questions with the most answers
  const questionCounts = await prisma.responseAnswer.groupBy({
    by: ["questionId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  // Fetch question texts for the top questions (no PII)
  const topQuestionIds = questionCounts.map((q) => q.questionId);
  const questions = await prisma.surveyQuestion.findMany({
    where: { id: { in: topQuestionIds } },
    select: { id: true, questionText: true },
  });
  const questionMap = new Map(questions.map((q) => [q.id, q.questionText]));

  const topSymptoms = questionCounts.map((q) => ({
    questionText: questionMap.get(q.questionId) ?? "Unknown",
    responseCount: q._count.id,
  }));

  // Severity distribution: aggregate all SCALE and SINGLE_CHOICE answers
  const scaleAnswers = await prisma.responseAnswer.findMany({
    where: {
      question: {
        questionType: { in: ["SCALE", "SINGLE_CHOICE"] },
      },
    },
    select: { answer: true },
  });

  const severityCounts = new Map<string, number>();
  for (const row of scaleAnswers) {
    const label = typeof row.answer === "string" ? row.answer : JSON.stringify(row.answer);
    severityCounts.set(label, (severityCounts.get(label) ?? 0) + 1);
  }

  const totalScaleAnswers = scaleAnswers.length || 1; // avoid division by zero
  const severityDistribution = Array.from(severityCounts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / totalScaleAnswers) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Responses over time: group by month
  const allResponses = await prisma.surveyResponse.findMany({
    select: { submittedAt: true },
    orderBy: { submittedAt: "asc" },
  });

  const monthCounts = new Map<string, number>();
  for (const r of allResponses) {
    const d = new Date(r.submittedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }

  const responsesByMonth = Array.from(monthCounts.entries()).map(([month, count]) => ({
    month,
    count,
  }));

  const stats: PublicStatistics = {
    totalResponses,
    totalQuestions,
    topSymptoms,
    severityDistribution,
    responsesByMonth,
  };

  await setCached(cacheKey, stats, STATS_CACHE_TTL);
  return stats;
}
