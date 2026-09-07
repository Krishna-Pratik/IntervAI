// Drizzle ORM schema for users, resumes, interviews, evaluations and subscriptions.

import { pgTable, text, timestamp, uuid, integer, jsonb, pgEnum, boolean, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';

// Enums

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'free',
  'trial',
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);

export const interviewSessionStatusEnum = pgEnum('interview_session_status', [
  'in_progress',
  'completed',
  'abandoned',
]);

export const interviewDifficultyEnum = pgEnum('interview_difficulty', [
  'easy',
  'medium',
  'hard',
]);

// Tables

/**
 * Users — PK is the Clerk user ID so identity always matches the auth
 * provider. `isAdmin` bypasses paywall/trial checks; set by direct SQL
 * only, never exposed via user-facing endpoints.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID (e.g. "user_abc123")
  email: text('email').notNull().unique(),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('free'),
  trialCount: integer('trial_count').notNull().default(0),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Resumes — the raw file lives in Cloudinary; only the URL and the
 * extracted profile JSON are persisted here.
 */
export const resumes = pgTable('resumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  cloudinaryUrl: text('cloudinary_url').notNull(),
  cloudinaryPublicId: text('cloudinary_public_id').notNull(),
  // Original upload filename — what the pickers display. Nullable:
  // rows predating this column fall back to a generic label in the UI.
  fileName: text('file_name'),
  // sha256 of the uploaded bytes — lets a byte-identical re-upload reuse
  // the stored row instead of creating a duplicate. Nullable for the
  // same reason as fileName.
  contentHash: text('content_hash'),
  resumeProfile: jsonb('resume_profile').$type<ResumeProfile | null>().default(null),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Interview sessions — one per interview attempt.
 */
export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetRole: text('target_role').notNull(),
  difficulty: interviewDifficultyEnum('difficulty').notNull().default('medium'),
  // Optional target company fed to the AI prompt for question style,
  // never shown in the question itself (prompts must not invent facts about it).
  company: text('company'),
  // Chosen on the setup page; the AI planner derives the question count from it.
  durationMinutes: integer('duration_minutes'),
  // Optional pasted job description, fed to the planner / question prompts.
  jobDescription: text('job_description'),
  // LLM-designed flow, generated on the session's first next-question call.
  questionPlan: jsonb('question_plan').$type<QuestionPlan | null>().default(null),
  // Cumulative scorecard, written when the session is ended.
  summary: jsonb('summary').$type<SessionSummary | null>().default(null),
  endedAt: timestamp('ended_at'),
  status: interviewSessionStatusEnum('status').notNull().default('in_progress'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Questions — ordered within a session; `followUpOf` links a follow-up
 * back to the question it stems from.
 */
export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => interviewSessions.id, { onDelete: 'cascade' }),
  questionText: text('question_text').notNull(),
  order: integer('order').notNull(),
  followUpOf: uuid('follow_up_of').references((): AnyPgColumn => questions.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => questions.id, { onDelete: 'cascade' }),
  transcriptText: text('transcript_text').notNull(),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
});

/**
 * Evaluations — AI assessment of an answer; `source` records which
 * model/layer produced it.
 */
export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  answerId: uuid('answer_id')
    .notNull()
    .references(() => answers.id, { onDelete: 'cascade' }),
  overallScore: integer('overall_score').notNull(), // 1–10
  precisionLevel: integer('precision_level'), // confidence in score
  growthPotential: integer('growth_potential'),
  source: text('source', { enum: ['gemini', 'openrouter', 'deterministic'] }).notNull(),
  rawFeedback: jsonb('raw_feedback').$type<RawFeedback | null>().default(null),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  razorpaySubscriptionId: text('razorpay_subscription_id').notNull().unique(),
  status: subscriptionStatusEnum('status').notNull().default('free'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// JSONB column types

export interface ResumeProfile {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills: string[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
}

export interface ExperienceItem {
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  description: string;
}

export interface ProjectItem {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
}

export interface EducationItem {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
}

/**
 * Raw AI feedback JSON. `followUpQuestion` is optional — deterministic
 * fallback results and older rows don't have one.
 */
export interface RawFeedback {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  detailedScores: Record<string, number>;
  followUpQuestion?: string;
}

/**
 * LLM-designed interview flow, generated once on the session's first
 * next-question call — the LLM picks the count and the topic ordering.
 */
export interface QuestionPlan {
  /** How many top-level questions the interview should run. */
  totalQuestions: number;
  /** Ordered topic flow — topic i is the subject of question i. */
  topics: string[];
  /** Short planner rationale (optional, for debugging / display). */
  note?: string;
}

/**
 * Cumulative end-of-session scorecard. The stats (`overallScore`,
 * `questionScores`, …) are computed deterministically from the
 * evaluations so the report always exists; the narrative fields
 * (`verdict`, `strengths`, `improvements`) come from the AI summariser
 * and degrade to plain generated text if both models are down
 * (`source: 'deterministic'` marks that case).
 */
export interface SessionSummary {
  /** Mean of the per-question scores, one decimal (1–10). */
  overallScore: number;
  precisionAvg: number;
  growthAvg: number;
  answeredCount: number;
  /** Top-level questions the candidate never answered (skipped/left open). */
  skippedCount: number;
  questionScores: Array<{
    order: number;
    questionText: string;
    /** Null for an unanswered question. */
    score: number | null;
    isFollowUp: boolean;
  }>;
  /** 2–4 sentence wrap-up of the whole interview. */
  verdict: string;
  /** Cross-question strengths the evaluator saw repeatedly. */
  strengths: string[];
  /** The highest-leverage things to work on next. */
  improvements: string[];
  source: 'gemini' | 'openrouter' | 'deterministic';
  generatedAt: string; // ISO timestamp
}

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  resumes: many(resumes),
  interviewSessions: many(interviewSessions),
  subscriptions: many(subscriptions),
}));

export const resumesRelations = relations(resumes, ({ one }) => ({
  user: one(users, {
    fields: [resumes.userId],
    references: [users.id],
  }),
}));

export const interviewSessionsRelations = relations(interviewSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [interviewSessions.userId],
    references: [users.id],
  }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  session: one(interviewSessions, {
    fields: [questions.sessionId],
    references: [interviewSessions.id],
  }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
  evaluation: one(evaluations, {
    fields: [answers.id],
    references: [evaluations.answerId],
  }),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  answer: one(answers, {
    fields: [evaluations.answerId],
    references: [answers.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));
