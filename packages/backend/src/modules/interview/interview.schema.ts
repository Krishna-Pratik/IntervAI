// Request-payload validation — bad data never reaches the AI layer or the DB.

import { z } from 'zod';

export const difficultySchema = z.enum(['easy', 'medium', 'hard'], {
  error: 'difficulty must be one of: easy, medium, hard',
});

export const createSessionBodySchema = z.object({
  targetRole: z.string().trim().min(2, 'targetRole is too short').max(100),
  difficulty: difficultySchema.default('medium'),
  // Length caps everywhere keep stray pastes out of the prompt builder.
  company: z.string().trim().max(100).optional(),
  // Required — the AI planner derives the question count from it.
  durationMinutes: z
    .number({ error: 'durationMinutes is required' })
    .int('durationMinutes must be a whole number of minutes')
    .min(5, 'durationMinutes must be at least 5 minutes')
    .max(90, 'durationMinutes cannot exceed 90 minutes'),
  jobDescription: z.string().trim().min(1).max(5000, 'jobDescription is too long').optional(),
  // Required — the interview is planned from the resume's profile.
  resumeId: z.string().uuid({ message: 'resumeId is required' }),
});

export const submitAnswerBodySchema = z.object({
  questionId: z.string().uuid({ message: 'questionId must be a UUID' }),
  transcriptText: z
    .string()
    .min(1, 'transcriptText cannot be empty')
    .max(20_000, 'transcriptText is too long'),
});

/** POST /sessions/:id/follow-up — parent is the just-answered question. */
export const followUpBodySchema = z.object({
  parentQuestionId: z.string().uuid({ message: 'parentQuestionId must be a UUID' }),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'sessionId must be a UUID' }),
});
