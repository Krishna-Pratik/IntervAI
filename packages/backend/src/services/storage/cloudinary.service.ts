/**
 * Resume file storage on Cloudinary (URL + public_id only — the DB
 * never holds raw files).
 */

import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { config } from '../../shared/config/index.js';

let initialized = false;

function ensureCloudinaryConfig(): void {
  if (initialized) return;

  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  });

  initialized = true;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
}

/** Streams the buffer via upload_stream — never touches disk. */
export async function uploadResumeFile(
  buffer: Buffer,
  originalFilename: string,
  userId: string,
): Promise<CloudinaryUploadResult> {
  ensureCloudinaryConfig();

  // Sanitized name + timestamp → unique public_id.
  const sanitizedName = originalFilename
    .toLowerCase()
    .replace(/\.[^/.]+$/, '') // strip extension
    .replace(/[^a-z0-9-_]/g, '-')
    .slice(0, 50);

  const timestamp = Date.now();
  const publicId = `resumes/${userId}/${sanitizedName}-${timestamp}`;

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'raw',
        // Keep the original extension so downloads serve the right content type.
        format: originalFilename.split('.').pop()?.toLowerCase(),
        tags: ['resume', `user:${userId}`],
      },
      (error: unknown, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          reject(error instanceof Error ? error : new Error('Cloudinary upload failed'));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format ?? '',
          bytes: result.bytes,
        });
      },
    );

    uploadStream.end(buffer);
  });
}

/** Cleanup when a DB insert fails after upload. */
export async function deleteResumeFile(publicId: string): Promise<void> {
  ensureCloudinaryConfig();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
}
