/**
 * Resume routes — list / upload / fetch. The upload pipeline:
 * multer → Cloudinary → text extraction → Gemini profile → DB.
 * Identity is taken only from the authenticated request.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  requireAuth,
  getUserId,
  getUserEmail,
} from '../../shared/middleware/auth.middleware.js';
import { validate, handleValidationErrors } from '../../shared/middleware/validate.middleware.js';
import {
  listResumesQuerySchema,
  resumeIdParamsSchema,
  RESUME_UPLOAD_LIMITS,
} from './resume.schema.js';
import {
  uploadResume,
  listResumes,
  getResume,
} from './resume.service.js';

// Memory storage — the resume never touches local disk; the buffer
// streams straight to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: RESUME_UPLOAD_LIMITS.maxBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const mimeOk = (RESUME_UPLOAD_LIMITS.allowedMimeTypes as readonly string[]).includes(
      file.mimetype,
    );
    const extOk = (RESUME_UPLOAD_LIMITS.allowedExtensions as readonly string[]).includes(ext);
    if (!mimeOk && !extOk) {
      cb(new Error(`Unsupported file type: ${file.mimetype || ext}`));
      return;
    }
    cb(null, true);
  },
});

export const resumeRouter = Router();

resumeRouter.get(
  '/',
  requireAuth,
  validate.query(listResumesQuerySchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const query = (req as unknown as { validated?: { query?: { limit?: number } } })
        .validated?.query;
      const limit = query?.limit ?? 10;

      const rows = await listResumes(userId, limit);
      res.json({ resumes: rows });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next(err);
    }
  },
);

// Upload — form field name: "file"
resumeRouter.post(
  '/',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'File too large',
              message: `Max size is ${RESUME_UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB`,
            });
            return;
          }
          res.status(400).json({ error: 'Upload error', message: err.message });
          return;
        }
        res.status(400).json({ error: 'Upload error', message: (err as Error).message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);

      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded. Use form field "file".' });
        return;
      }

      const email = getUserEmail(req, userId);

      const result = await uploadResume({
        userId,
        email,
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
      });

      res.status(201).json({
        resumeId: result.resumeId,
        cloudinaryUrl: result.cloudinaryUrl,
        fileName: result.fileName,
        profile: result.profile,
        reused: result.reused ?? false,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Resume processing failed';
      if (
        message.includes('Unsupported file') ||
        message.includes('Could not extract') ||
        message.includes('not supported')
      ) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }
      if ((err as { statusCode?: number }).statusCode === 401) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next(err);
    }
  },
);

resumeRouter.get(
  '/:id',
  requireAuth,
  validate.params(resumeIdParamsSchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const params = (req as unknown as { validated?: { params?: { id: string } } })
        .validated?.params;
      if (!params) {
        res.status(400).json({ error: 'Invalid resume id' });
        return;
      }

      const row = await getResume(userId, params.id);
      if (!row) {
        res.status(404).json({ error: 'Resume not found' });
        return;
      }

      res.json({ resume: row });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next(err);
    }
  },
);
