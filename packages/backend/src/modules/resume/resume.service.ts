/**
 * Resume upload pipeline: dedupe check → Cloudinary → text extraction →
 * Gemini profile → DB row. Any failure after the upload deletes the
 * Cloudinary asset so nothing orphans. Routes never touch these
 * services directly.
 */

import { createHash } from 'node:crypto';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../shared/db/db.js';
import { resumes, users, type ResumeProfile } from '../../db/schema.js';
import { uploadResumeFile, deleteResumeFile } from '../../services/storage/cloudinary.service.js';
import { parseResumeBuffer, detectFormat } from '../../services/parser/resume-parser.service.js';
import { extractResumeProfile } from '../../services/ai/gemini.service.js';

export interface UploadResumeInput {
  userId: string; // Clerk user id, comes from req.auth
  email: string; // for upserting the user row
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
}

export interface UploadResumeResult {
  resumeId: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  fileName: string;
  profile: ResumeProfile;
  /** True when an identical upload was already stored — the existing
   *  row was reused without re-uploading, re-parsing, or paying for an
   *  AI extraction call. */
  reused?: boolean;
}

/** Clerk owns identity; the local row exists for FK relationships. */
async function ensureUserRow(userId: string, email: string): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));

  if (existing.length === 0) {
    // subscriptionStatus/trialCount take their schema defaults.
    await db.insert(users).values({
      id: userId,
      email,
    });
  }
}

/** Throws on unsupported format, Cloudinary/extraction/Gemini failure. */
export async function uploadResume(input: UploadResumeInput): Promise<UploadResumeResult> {
  // Validate the format up front so we don't pay for an upload.
  const format = detectFormat(input.originalFilename, input.mimeType);
  if (!format) {
    throw new Error(
      `Unsupported file: ${input.originalFilename}. Allowed: PDF, DOCX, TXT.`,
    );
  }

  await ensureUserRow(input.userId, input.email);

  const contentHash = createHash('sha256').update(input.buffer).digest('hex');

  // Dedupe A — byte-identical file already stored: reuse the row as-is.
  // No Cloudinary upload, no text extraction, no Gemini call, no new row.
  const byHash = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, input.userId), eq(resumes.contentHash, contentHash)))
    .limit(1);
  const identical = byHash[0];
  if (identical?.resumeProfile) {
    return {
      resumeId: identical.id,
      cloudinaryUrl: identical.cloudinaryUrl,
      cloudinaryPublicId: identical.cloudinaryPublicId,
      fileName: identical.fileName ?? input.originalFilename,
      profile: identical.resumeProfile,
      reused: true,
    };
  }

  // Dedupe B — same filename with different bytes: it's a revised resume.
  // The row gets replaced in place (below, after parse succeeds) so the
  // picker shows one entry per name instead of stacking duplicates.
  const priorByName = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, input.userId), eq(resumes.fileName, input.originalFilename)))
    .limit(1);
  const prior = priorByName[0];

  const uploaded = await uploadResumeFile(
    input.buffer,
    input.originalFilename,
    input.userId,
  );

  try {
    const parsed = await parseResumeBuffer(input.buffer, format);

    if (!parsed.text || parsed.text.length < 20) {
      throw new Error(
        'Could not extract meaningful text from the resume. The file may be scanned/image-only.',
      );
    }

    const { data: profile } = await extractResumeProfile(parsed.text);

    if (prior) {
      await db
        .update(resumes)
        .set({
          cloudinaryUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          contentHash,
          resumeProfile: profile,
          updatedAt: new Date(),
        })
        .where(eq(resumes.id, prior.id));
      // The old asset is superseded — best-effort cleanup, never fatal.
      deleteResumeFile(prior.cloudinaryPublicId).catch((cleanupErr) => {
        console.error(
          '[resume.service] Failed to delete superseded Cloudinary asset:',
          cleanupErr,
        );
      });
      return {
        resumeId: prior.id,
        cloudinaryUrl: uploaded.url,
        cloudinaryPublicId: uploaded.publicId,
        fileName: input.originalFilename,
        profile,
      };
    }

    const inserted = await db
      .insert(resumes)
      .values({
        userId: input.userId,
        cloudinaryUrl: uploaded.url,
        cloudinaryPublicId: uploaded.publicId,
        fileName: input.originalFilename,
        contentHash,
        resumeProfile: profile,
      })
      .returning({ id: resumes.id });

    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to insert resume row');
    }

    return {
      resumeId: row.id,
      cloudinaryUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
      fileName: input.originalFilename,
      profile,
    };
  } catch (err) {
    // Best-effort cleanup so the asset doesn't leak.
    try {
      await deleteResumeFile(uploaded.publicId);
    } catch (cleanupErr) {
      console.error(
        '[resume.service] Failed to clean up Cloudinary asset after error:',
        cleanupErr,
      );
    }
    throw err;
  }
}

/** Newest first. */
export async function listResumes(userId: string, limit = 10) {
  const rows = await db
    .select({
      id: resumes.id,
      cloudinaryUrl: resumes.cloudinaryUrl,
      fileName: resumes.fileName,
      resumeProfile: resumes.resumeProfile,
      // Aliased so the client's `uploadedAt` fields actually populate
      // (it previously received undefined and rendered empty names).
      uploadedAt: resumes.createdAt,
    })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt))
    .limit(limit);

  return rows;
}

/** Null when missing or not owned by the user. */
export async function getResume(userId: string, resumeId: string) {
  const rows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.id, resumeId))
    .limit(1);

  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row;
}
