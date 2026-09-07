-- Migration: 0002_session_duration_plan
--
-- Adds three nullable columns to `interview_sessions`:
--
--   duration_minutes  — planned interview length chosen on the setup
--                       page. Drives how many questions the AI planner
--                       designs; no other layer hard-codes a count.
--   job_description   — optional pasted JD. Fed to the planner and
--                       question prompts for role-specific questions.
--   question_plan     — the LLM-designed interview flow (question
--                       count + ordered topics), written on the first
--                       next-question call of a session.
--
-- All three are NULLABLE so existing rows keep working untouched:
-- a session with a null plan simply gets one generated the next
-- time the client asks for a question (the planner runs on the
-- same call that used to generate a lone question).
--
-- Why a hand-written file and not drizzle-kit generate: this repo
-- keeps migrations as standalone SQL (see 0001_add_user_is_admin.sql)
-- and applies them out-of-band.

ALTER TABLE "interview_sessions" ADD COLUMN "duration_minutes" integer;
ALTER TABLE "interview_sessions" ADD COLUMN "job_description" text;
ALTER TABLE "interview_sessions" ADD COLUMN "question_plan" jsonb;
