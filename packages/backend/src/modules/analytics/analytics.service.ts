/**
 * Analytics domain service — SQL aggregations for the dashboard.
 * Every function takes a `userId`; all queries are user-scoped.
 * No HTTP knowledge here (routes own that). Each query is a single
 * round-trip; Drizzle's `sql` tag covers AVG and JSONB ops.
 */

import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { db } from '../../shared/db/db.js';
import {
  interviewSessions,
  questions,
  answers,
  evaluations,
} from '../../db/schema.js';

// Result types

export interface OverviewMetrics {
  totalSessions: number;
  completedSessions: number;
  totalQuestions: number;
  totalEvaluations: number;
  avgOverallScore: number | null;
  avgPrecision: number | null;
  avgGrowth: number | null;
  bestRole: { role: string; avgScore: number } | null;
  currentStreakDays: number;
  daysActive30: number;
}

export interface ScoreTrendPoint {
  /** ISO date 'YYYY-MM-DD' */
  date: string;
  /** Average overallScore on this day. null if no evals. */
  avgScore: number | null;
  /** How many evaluation rows were on this day. */
  evalCount: number;
}

export interface RolePerformance {
  role: string;
  sessionCount: number;
  avgScore: number | null;
}

export interface DifficultyPerformance {
  difficulty: 'easy' | 'medium' | 'hard';
  sessionCount: number;
  avgScore: number | null;
}

export interface SourceMix {
  source: 'gemini' | 'openrouter' | 'deterministic';
  count: number;
  pct: number;
}

export interface FeedbackTheme {
  theme: string;
  occurrences: number;
}

// Overview KPIs

/** Top-of-dashboard KPI tiles. */
export async function getOverviewMetrics(userId: string): Promise<OverviewMetrics> {
  // -- Session / question counts --
  const sessionRows = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${interviewSessions.status} = 'completed')::int`,
    })
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, userId));

  const totalSessions = Number(sessionRows[0]?.total ?? 0);
  const completedSessions = Number(sessionRows[0]?.completed ?? 0);

  const questionCountRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questions)
    .innerJoin(interviewSessions, eq(questions.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.userId, userId));
  const totalQuestions = Number(questionCountRow[0]?.n ?? 0);

  // Evaluation aggregates: evaluations -> answers -> questions -> sessions
  const evalAgg = await db
    .select({
      n: sql<number>`count(*)::int`,
      avgScore: sql<number | null>`avg(${evaluations.overallScore})::float`,
      avgPrecision: sql<number | null>`avg(${evaluations.precisionLevel})::float`,
      avgGrowth: sql<number | null>`avg(${evaluations.growthPotential})::float`,
    })
    .from(evaluations)
    .innerJoin(answers, eq(evaluations.answerId, answers.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(interviewSessions, eq(questions.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.userId, userId));

  const evalRow = evalAgg[0];
  const totalEvaluations = Number(evalRow?.n ?? 0);

  // -- Best role (highest avg score, min 2 sessions) --
  const bestRoleRow = await db
    .select({
      role: interviewSessions.targetRole,
      avgScore: sql<number>`avg(${evaluations.overallScore})::float`,
      n: sql<number>`count(distinct ${interviewSessions.id})::int`,
    })
    .from(evaluations)
    .innerJoin(answers, eq(evaluations.answerId, answers.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(interviewSessions, eq(questions.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.userId, userId))
    .groupBy(interviewSessions.targetRole)
    .having(sql`count(distinct ${interviewSessions.id}) >= 2`)
    .orderBy(desc(sql`avg(${evaluations.overallScore})`))
    .limit(1);

  const bestRole = bestRoleRow[0]
    ? {
        role: bestRoleRow[0].role,
        avgScore: Number(bestRoleRow[0].avgScore),
      }
    : null;

  // -- Streak: consecutive days (ending today) with at least 1 eval --
  const streakRow = await db
    .select({
      day: sql<string>`to_char(${evaluations.createdAt}, 'YYYY-MM-DD')`,
    })
    .from(evaluations)
    .innerJoin(answers, eq(evaluations.answerId, answers.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(interviewSessions, eq(questions.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.userId, userId))
    .groupBy(sql`to_char(${evaluations.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(${evaluations.createdAt}, 'YYYY-MM-DD')`));

  const activeDays = new Set(streakRow.map((r) => r.day));
  const currentStreakDays = countTrailingStreak(activeDays);

  // -- Active days in the last 30 --
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const daysActive30 = [...activeDays].filter((d) => new Date(d) >= thirtyDaysAgo).length;

  return {
    totalSessions,
    completedSessions,
    totalQuestions,
    totalEvaluations,
    avgOverallScore: evalRow?.avgScore != null ? Number(evalRow.avgScore) : null,
    avgPrecision: evalRow?.avgPrecision != null ? Number(evalRow.avgPrecision) : null,
    avgGrowth: evalRow?.avgGrowth != null ? Number(evalRow.avgGrowth) : null,
    bestRole,
    currentStreakDays,
    daysActive30,
  };
}

// Score trend (last N days, daily buckets)

/**
 * One row per day in the window — days with no evals get
 * `avgScore: null, evalCount: 0` so the chart x-axis is complete.
 */
export async function getScoreTrend(
  userId: string,
  daysBack = 30,
): Promise<ScoreTrendPoint[]> {
  // Day list generated in JS (avoids a generate_series query).
  const days: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const earliest = days[0]!;

  // All evals in the window, grouped by day (string-formatted to stay
  // JSON-friendly).
  const rows = await db
    .select({
      day: sql<string>`to_char(${evaluations.createdAt}, 'YYYY-MM-DD')`,
      avgScore: sql<number>`avg(${evaluations.overallScore})::float`,
      evalCount: sql<number>`count(*)::int`,
    })
    .from(evaluations)
    .innerJoin(answers, eq(evaluations.answerId, answers.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(interviewSessions, eq(questions.sessionId, interviewSessions.id))
    .where(
      and(
        eq(interviewSessions.userId, userId),
        gte(evaluations.createdAt, new Date(earliest + 'T00:00:00Z')),
      ),
    )
    .groupBy(sql`to_char(${evaluations.createdAt}, 'YYYY-MM-DD')`);

  // Expand the lookup to every day in the window.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((date) => {
    const hit = byDay.get(date);
    return {
      date,
      avgScore: hit ? Number(hit.avgScore) : null,
      evalCount: hit ? Number(hit.evalCount) : 0,
    };
  });
}

// Performance by target role

export async function getPerformanceByRole(
  userId: string,
  limit = 8,
): Promise<RolePerformance[]> {
  const rows = await db
    .select({
      role: interviewSessions.targetRole,
      sessionCount: sql<number>`count(distinct ${interviewSessions.id})::int`,
      avgScore: sql<number | null>`avg(${evaluations.overallScore})::float`,
    })
    .from(interviewSessions)
    .leftJoin(questions, eq(questions.sessionId, interviewSessions.id))
    .leftJoin(answers, eq(answers.questionId, questions.id))
    .leftJoin(evaluations, eq(evaluations.answerId, answers.id))
    .where(eq(interviewSessions.userId, userId))
    .groupBy(interviewSessions.targetRole)
    .orderBy(desc(sql`count(distinct ${interviewSessions.id})`))
    .limit(limit);

  return rows.map((r) => ({
    role: r.role,
    sessionCount: Number(r.sessionCount),
    avgScore: r.avgScore != null ? Number(r.avgScore) : null,
  }));
}

// Performance by difficulty

export async function getPerformanceByDifficulty(
  userId: string,
): Promise<DifficultyPerformance[]> {
  const rows = await db
    .select({
      difficulty: interviewSessions.difficulty,
      sessionCount: sql<number>`count(distinct ${interviewSessions.id})::int`,
      avgScore: sql<number | null>`avg(${evaluations.overallScore})::float`,
    })
    .from(interviewSessions)
    .leftJoin(questions, eq(questions.sessionId, interviewSessions.id))
    .leftJoin(answers, eq(answers.questionId, questions.id))
    .leftJoin(evaluations, eq(evaluations.answerId, answers.id))
    .where(eq(interviewSessions.userId, userId))
    .groupBy(interviewSessions.difficulty);

  // Always return all three difficulties, even if some have 0 sessions.
  const byDiff = new Map<'easy' | 'medium' | 'hard', (typeof rows)[number]>(
    rows.map((r) => [r.difficulty as 'easy' | 'medium' | 'hard', r]),
  );
  return (['easy', 'medium', 'hard'] as const).map((d) => {
    const r = byDiff.get(d);
    return {
      difficulty: d,
      sessionCount: r ? Number(r.sessionCount) : 0,
      avgScore: r && r.avgScore != null ? Number(r.avgScore) : null,
    };
  });
}

// AI source mix

export async function getSourceMix(userId: string): Promise<SourceMix[]> {
  const rows = await db
    .select({
      source: evaluations.source,
      count: sql<number>`count(*)::int`,
    })
    .from(evaluations)
    .innerJoin(answers, eq(evaluations.answerId, answers.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(interviewSessions, eq(questions.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.userId, userId))
    .groupBy(evaluations.source);

  const total = rows.reduce((s, r) => s + Number(r.count), 0);

  return (['gemini', 'openrouter', 'deterministic'] as const).map((source) => {
    const hit = rows.find((r) => r.source === source);
    const count = hit ? Number(hit.count) : 0;
    return {
      source,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}

// Recurring themes (strengths / weaknesses)

/**
 * Recurring themes from the `strengths`/`weaknesses` JSONB arrays,
 * deduped by a 3-word signature — bullets are full sentences, so the
 * first 3 words give a stable bucket; full sentences never dedup.
 */
export async function getTopFeedbackThemes(
  userId: string,
  kind: 'strengths' | 'weaknesses',
  limit = 5,
): Promise<FeedbackTheme[]> {
  // `kind` is bound as a parameter (not interpolated), so the query is safe.
  const rows = await db.execute<{
    item: string;
    n: number;
  }>(sql`
    SELECT item, count(*)::int AS n
    FROM (
      SELECT jsonb_array_elements_text(${evaluations.rawFeedback}->${kind}) AS item
      FROM ${evaluations}
      INNER JOIN ${answers} ON ${evaluations.answerId} = ${answers.id}
      INNER JOIN ${questions} ON ${answers.questionId} = ${questions.id}
      INNER JOIN ${interviewSessions} ON ${questions.sessionId} = ${interviewSessions.id}
      WHERE ${interviewSessions.userId} = ${userId}
    ) AS items
    WHERE length(item) > 0
    GROUP BY item
    ORDER BY n DESC, item ASC
  `);

  // Normalize to a 3-word signature, then re-aggregate.
  const bucket = new Map<string, { theme: string; n: number }>();
  for (const r of rows.rows ?? []) {
    const sig = signature(r.item);
    if (!sig) continue;
    const existing = bucket.get(sig);
    if (existing) {
      existing.n += Number(r.n);
    } else {
      bucket.set(sig, { theme: r.item, n: Number(r.n) });
    }
  }

  return [...bucket.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((b) => ({ theme: b.theme, occurrences: b.n }));
}

// Pure helpers (exported for unit testing)

/** 3-word signature: lowercased, punctuation stripped. */
export function signature(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 3)
    .join(' ');
  return cleaned;
}

/**
 * Consecutive-day streak ending at the latest active day (not the
 * calendar today — a gap-free run up to the most recent activity).
 */
export function countTrailingStreak(activeDays: Set<string>): number {
  if (activeDays.size === 0) return 0;
  const sorted = [...activeDays].sort(); // ascending 'YYYY-MM-DD' sort
  const latest = sorted[sorted.length - 1]!;
  let streak = 0;
  const cursor = new Date(latest + 'T00:00:00Z');
  for (;;) {
    const iso = cursor.toISOString().slice(0, 10);
    if (activeDays.has(iso)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
