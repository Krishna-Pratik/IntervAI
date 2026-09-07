-- Migration: 0003_session_summary
--
-- Adds two nullable columns to `interview_sessions`:
--
--   summary   — cumulative end-of-session scorecard (deterministic
--               stats + AI narrative), written when the session is
--               ended via POST /sessions/:id/end.
--   ended_at  — when the session was closed.
--
-- Nullable so every existing row keeps working; old sessions simply
-- have no report until the end-call is made.
--
-- Hand-written SQL per repo convention (see 0001/0002).

ALTER TABLE "interview_sessions" ADD COLUMN "summary" jsonb;
ALTER TABLE "interview_sessions" ADD COLUMN "ended_at" timestamp;
