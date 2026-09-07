// Resume request validation.

import { z } from 'zod';

export const resumeIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'resume id must be a valid UUID' }),
});

export const listResumesQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .transform((s) => parseInt(s, 10))
    .refine((n) => n > 0 && n <= 50, 'limit must be between 1 and 50')
    .optional(),
});

// Enforced by multer in the upload route.
export const RESUME_UPLOAD_LIMITS = {
  maxBytes: 5 * 1024 * 1024, // 5 MB
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/msword', // doc (legacy — we reject these but accept the header)
    'text/plain',
  ],
  allowedExtensions: ['pdf', 'docx', 'txt'],
} as const;
