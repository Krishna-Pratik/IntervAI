/**
 * Interview routes — every endpoint:
 * requireAuth → Zod validation → service.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  requireAuth,
  getUserId,
  getUserEmail,
} from '../../shared/middleware/auth.middleware.js';
import { validate, handleValidationErrors } from '../../shared/middleware/validate.middleware.js';
import {
  createSessionBodySchema,
  submitAnswerBodySchema,
  followUpBodySchema,
  sessionIdParamsSchema,
} from './interview.schema.js';
import {
  createInterviewSession,
  generateNextQuestion,
  generateFollowUpQuestion,
  submitAnswer,
  getSessionDetail,
  endInterviewSession,
  InterviewServiceError,
} from './interview.service.js';

export const interviewRouter = Router();

// Type-safe access to the `validated` data attached by the middleware
type ValidatedRequest<P = unknown, B = unknown, Q = unknown> = Request & {
  validated?: { body?: B; params?: P; query?: Q };
};

interviewRouter.post(
  '/sessions',
  requireAuth,
  validate.body(createSessionBodySchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const body = (req as ValidatedRequest<unknown, {
        targetRole: string;
        difficulty: 'easy' | 'medium' | 'hard';
        company?: string;
        durationMinutes: number;
        jobDescription?: string;
        resumeId: string;
      }>).validated?.body;

      if (!body) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      const result = await createInterviewSession({
        userId,
        email: getUserEmail(req, userId),
        targetRole: body.targetRole,
        difficulty: body.difficulty,
        company: body.company ?? null,
        durationMinutes: body.durationMinutes ?? null,
        jobDescription: body.jobDescription ?? null,
        resumeId: body.resumeId,
      });

      res.status(201).json({ session: result });
    } catch (err) {
      if (err instanceof InterviewServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

interviewRouter.get(
  '/sessions/:id',
  requireAuth,
  validate.params(sessionIdParamsSchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const params = (req as ValidatedRequest<{ id: string }>).validated?.params;
      if (!params) {
        res.status(400).json({ error: 'Invalid session id' });
        return;
      }

      const detail = await getSessionDetail(userId, params.id);
      res.json(detail);
    } catch (err) {
      if (err instanceof InterviewServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

interviewRouter.post(
  '/sessions/:id/questions',
  requireAuth,
  validate.params(sessionIdParamsSchema),
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const params = (req as ValidatedRequest<{ id: string }>).validated?.params;
      if (!params) {
        res.status(400).json({ error: 'Invalid session id' });
        return;
      }

      const result = await generateNextQuestion({
        userId,
        sessionId: params.id,
      });

      res.status(201).json({
        question: {
          questionId: result.questionId,
          questionText: result.questionText,
          intent: result.intent,
          order: result.order,
          source: result.source,
          plannedTotal: result.plannedTotal,
        },
      });
    } catch (err) {
      if (err instanceof InterviewServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      // Gemini / AI errors are not InterviewServiceError — surface as 502
      const message = (err as Error).message ?? 'Question generation failed';
      res.status(502).json({ error: 'AI service error', message });
    }
  },
);

interviewRouter.post(
  '/sessions/:id/follow-up',
  requireAuth,
  validate.params(sessionIdParamsSchema),
  validate.body(followUpBodySchema),
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const params = (req as ValidatedRequest<{ id: string }>).validated?.params;
      const body = (req as ValidatedRequest<unknown, { parentQuestionId: string }>)
        .validated?.body;
      if (!params || !body) {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }

      const result = await generateFollowUpQuestion({
        userId,
        sessionId: params.id,
        parentQuestionId: body.parentQuestionId,
      });

      res.status(201).json({
        question: {
          questionId: result.questionId,
          questionText: result.questionText,
          intent: result.intent,
          order: result.order,
          source: result.source,
        },
      });
    } catch (err) {
      if (err instanceof InterviewServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      // Both AI models failed — 502 lets the client fall through to
      // a fresh top-level question.
      const message = (err as Error).message ?? 'Follow-up generation failed';
      res.status(502).json({ error: 'AI service error', message });
    }
  },
);

interviewRouter.post(
  '/sessions/:id/answers',
  requireAuth,
  validate.params(sessionIdParamsSchema),
  validate.body(submitAnswerBodySchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const params = (req as ValidatedRequest<{ id: string }>).validated?.params;
      const body = (req as ValidatedRequest<unknown, { questionId: string; transcriptText: string }>)
        .validated?.body;
      if (!params || !body) {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }

      const result = await submitAnswer({
        userId,
        sessionId: params.id,
        questionId: body.questionId,
        transcriptText: body.transcriptText,
      });

      res.status(201).json({
        answerId: result.answerId,
        evaluation: result.evaluation,
        evaluationSource: result.evaluationSource,
        evaluationModel: result.evaluationModel,
      });
    } catch (err) {
      if (err instanceof InterviewServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

interviewRouter.post(
  '/sessions/:id/end',
  requireAuth,
  validate.params(sessionIdParamsSchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const params = (req as ValidatedRequest<{ id: string }>).validated?.params;
      if (!params) {
        res.status(400).json({ error: 'Invalid session id' });
        return;
      }

      // Closes the session and returns the cumulative scorecard. AI
      // narrative failures degrade inside the service — this only
      // throws on data/auth errors.
      const summary = await endInterviewSession(userId, params.id);
      res.json({ summary });
    } catch (err) {
      if (err instanceof InterviewServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);
