/**
 * Session report — the cumulative scorecard shown after an interview
 * ends. The numbers (overall/precision/growth averages, per-question
 * table, answered vs skipped) are deterministic roll-ups the backend
 * computed from the stored evaluations; the verdict/strengths/
 * improvements narrative on top is AI-written.
 *
 * Reached by "End session" on the live page, or by visiting this URL
 * directly (the persisted summary is re-read from the session detail).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import clsx from 'clsx';
import {
  getSessionDetail,
  endInterviewSession,
  type InterviewSession,
  type SessionSummary,
} from '../../../../lib/api';
import { AppShell } from '../../../_components/AppShell';
import { GlassCard } from '../../../_components/GlassCard';
import { CenterMessage } from '../../../_components/CenterMessage';
import { ErrorNotice } from '../../../_components/ErrorNotice';
import { ScoreBar } from '../../_components/ScoreBar';

export default function SessionReportPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const sessionId = params?.sessionId;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the session; the summary rides along on the session row once
  // the end-call has persisted it.
  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await getSessionDetail(sessionId, getToken);
      setSession(detail.session);
      setSummary(detail.session.summary ?? null);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load the session');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
  }, [isLoaded, isSignedIn, load]);

  useEffect(() => {
    if (isLoaded && !isSignedIn && sessionId) {
      const back = window.location.pathname;
      router.replace(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
    }
  }, [isLoaded, isSignedIn, router, sessionId]);

  /** Generate (or regenerate) the report — also closes an open session. */
  async function generateReport() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const s = await endInterviewSession(sessionId, getToken);
      setSummary(s);
      setSession((prev) =>
        prev ? { ...prev, summary: s, status: 'completed' } : prev,
      );
    } catch (err) {
      setError((err as Error).message ?? 'Failed to generate the report');
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded || loading) {
    return (
      <AppShell>
        <CenterMessage>Loading report…</CenterMessage>
      </AppShell>
    );
  }
  if (!isSignedIn) {
    return (
      <AppShell>
        <CenterMessage>Redirecting to sign in…</CenterMessage>
      </AppShell>
    );
  }
  if (!session) {
    return (
      <AppShell>
        <section className="px-4 pt-16 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <ErrorNotice title="Report unavailable">
              {error ?? 'We could not find this session.'}
            </ErrorNotice>
            <Link
              href="/dashboard"
              className="mt-4 inline-flex min-h-[40px] items-center rounded-full border border-neon-glassHi px-4 py-2 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
            >
              ← Back to dashboard
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-4xl">
          {error && !summary && (
            <div className="mb-6">
              <ErrorNotice title="Problem">{error}</ErrorNotice>
            </div>
          )}

          {/* Session not closed yet (the live page's end-call failed, or
              someone opened a still-running session's URL) — the report
              needs the session ended first. */}
          {!summary && session.status === 'in_progress' ? (
            <GlassCard variant="strong" withOrbs className="p-6 sm:p-8">
              <div className="text-eyebrow text-neon-ink3">Session report</div>
              <h1 className="type-display mt-1 text-display-l text-neon-ink">
                This interview is still open.
              </h1>
              <p className="mt-3 max-w-md text-body-m text-neon-ink2">
                {session.targetRole} · {session.difficulty} — end it to
                generate your cumulative scorecard.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={generateReport}
                  disabled={busy}
                  className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                >
                  {busy ? 'Generating…' : 'End session & generate report'}
                  {!busy ? <span aria-hidden="true">→</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/interview/${sessionId}/live`)}
                  className="min-h-[44px] rounded-full border border-neon-glassHi px-4 py-2.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                >
                  Back to interview
                </button>
              </div>
            </GlassCard>
          ) : !summary ? (
            // No report yet and already closed (legacy session or the
            // end-call never landed) — generate from the stored data.
            <GlassCard variant="strong" withOrbs className="p-6 sm:p-8">
              <div className="text-eyebrow text-neon-ink3">Session report</div>
              <h1 className="type-display mt-1 text-display-l text-neon-ink">
                Build your scorecard.
              </h1>
              <p className="mt-3 max-w-md text-body-m text-neon-ink2">
                This interview was completed before the summary existed —
                we can roll it up from the stored answers right now.
              </p>
              <button
                type="button"
                onClick={generateReport}
                disabled={busy}
                className="type-display mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {busy ? 'Generating…' : 'Generate report'}
                {!busy ? <span aria-hidden="true">→</span> : null}
              </button>
            </GlassCard>
          ) : (
            <>
              {/* --- Header --- */}
              <div className="mb-8">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-neon-cyan"
                  />
                  Session report
                </span>
                <h1 className="type-display mt-3 text-display-l text-neon-ink sm:text-display-xl">
                  Your{' '}
                  <span className="text-gradient-neon-static">cumulative</span>{' '}
                  scorecard.
                </h1>
                <p className="mt-2 text-body-m text-neon-ink2">
                  {session.targetRole} · {session.difficulty}
                  {session.company ? ` · ${session.company}` : ''} ·{' '}
                  {formatDate(session.createdAt)}
                </p>
              </div>

              {/* --- Headline score + verdict --- */}
              <GlassCard variant="strong" withOrbs className="relative p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <div className="text-eyebrow text-neon-ink3">
                      Overall performance
                    </div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="type-display text-numeral text-gradient-neon-static leading-none">
                        {summary.overallScore}
                      </span>
                      <span className="pb-2 font-mono text-body-m text-neon-ink3">
                        / 10 average
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-body-m text-neon-ink2">
                      <span>
                        <strong className="text-neon-ink">{summary.answeredCount}</strong>{' '}
                        answered
                      </span>
                      <span aria-hidden="true" className="text-neon-ink3">·</span>
                      <span>
                        <strong className="text-neon-ink">{summary.skippedCount}</strong>{' '}
                        skipped
                      </span>
                      {session.durationMinutes && (
                        <>
                          <span aria-hidden="true" className="text-neon-ink3">·</span>
                          <span>planned {session.durationMinutes} min</span>
                        </>
                      )}
                    </div>
                  </div>
                  {summary.source === 'deterministic' && (
                    <div className="flex flex-col items-end gap-1">
                      <span className="max-w-[16rem] text-right font-mono text-[0.7rem] text-neon-ink3">
                        scores are exact; coaching notes pending (AI was
                        unavailable)
                      </span>
                    </div>
                  )}
                </div>

                {/* Averages as bars — same visual language as the live
                    evaluation card so the two screens read as one system. */}
                <div className="mt-6 space-y-2.5">
                  <ScoreBar
                    label="Overall"
                    value={summary.overallScore}
                    accent="violet"
                    widthClass="w-28"
                  />
                  <ScoreBar
                    label="Precision"
                    value={summary.precisionAvg}
                    accent="cyan"
                    widthClass="w-28"
                  />
                  <ScoreBar
                    label="Growth"
                    value={summary.growthAvg}
                    accent="violet"
                    widthClass="w-28"
                  />
                </div>

                <p className="mt-6 text-body-l leading-relaxed text-neon-ink">
                  {summary.verdict}
                </p>
              </GlassCard>

              {/* --- Strengths / improvements --- */}
              {(summary.strengths.length > 0 ||
                summary.improvements.length > 0) && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {summary.strengths.length > 0 && (
                    <GlassCard className="p-6">
                      <div className="text-eyebrow text-neon-cyan">
                        What went well
                      </div>
                      <ul className="mt-3 space-y-2.5">
                        {summary.strengths.map((s, i) => (
                          <li
                            key={i}
                            className="flex gap-2.5 text-body-m text-neon-ink2"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neon-cyan"
                            />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                  {summary.improvements.length > 0 && (
                    <GlassCard className="p-6">
                      <div className="text-eyebrow text-neon-magenta">
                        Work on next
                      </div>
                      <ul className="mt-3 space-y-2.5">
                        {summary.improvements.map((s, i) => (
                          <li
                            key={i}
                            className="flex gap-2.5 text-body-m text-neon-ink2"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neon-magenta"
                            />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                </div>
              )}

              {/* --- Per-question scorecard --- */}
              <GlassCard className="mt-6 p-6 sm:p-8">
                <div className="text-eyebrow text-neon-ink3">Question by question</div>
                <h2 className="type-display mt-1 text-display-s text-neon-ink">
                  The full run-down.
                </h2>
                <ol className="mt-5 space-y-2">
                  {summary.questionScores.map((q) => (
                    <li
                      key={q.order}
                      className="flex items-start justify-between gap-4 rounded-xl border border-neon-glass bg-neon-black/20 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[0.7rem] text-neon-ink3">
                            #{q.order}
                          </span>
                          {q.isFollowUp && (
                            <span className="rounded-full border border-neon-magenta/40 bg-neon-magenta/10 px-2 py-0.5 font-mono text-[0.65rem] text-neon-magenta">
                              follow-up
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-body-m text-neon-ink">
                          {q.questionText}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          'flex-shrink-0 rounded-full border px-3 py-1 font-mono text-[0.78rem]',
                          q.score === null
                            ? 'border-neon-glass text-neon-ink3'
                            : q.score >= 7
                              ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                              : q.score >= 4
                                ? 'border-neon-violet/50 bg-neon-violet/10 text-neon-violet2'
                                : 'border-neon-magenta/50 bg-neon-magenta/10 text-neon-magenta',
                        )}
                      >
                        {q.score === null ? 'skipped' : `${q.score}/10`}
                      </span>
                    </li>
                  ))}
                </ol>
                {summary.answeredCount === 0 && (
                  <p className="mt-4 text-body-m text-neon-ink3">
                    No answers were recorded in this session — run through a
                    full interview to get scored.
                  </p>
                )}
              </GlassCard>

              {/* --- CTAs --- */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/interview"
                  className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01]"
                >
                  Practice again <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/dashboard"
                  className="min-h-[44px] rounded-full border border-neon-glassHi px-5 py-2.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                >
                  Back to dashboard
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
