-- Persist the original upload filename so the "pick an earlier resume"
-- lists on /interview and /resume can label each entry. Nullable; older
-- rows keep NULL and render with a fallback name.
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_name text;
