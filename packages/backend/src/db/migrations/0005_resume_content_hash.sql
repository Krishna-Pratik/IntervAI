-- Content hash of the uploaded bytes so re-uploading the same resume
-- reuses the existing row instead of stacking duplicates. Nullable;
-- rows stored before this column simply miss the fast dedupe path.
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS content_hash text;
