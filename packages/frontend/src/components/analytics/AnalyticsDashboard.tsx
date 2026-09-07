/**
 * AnalyticsDashboard — the analytics view on /dashboard. Fetches all
 * six analytics endpoints in parallel (Promise.all — the page is "as
 * fast as the slowest endpoint", not the sum) and renders KPI tiles,
 * charts, and feedback themes; an empty state covers 0 completed
 * sessions. Recharts components live in sibling files to keep this
 * scannable; their colors come from ./chartTokens so a palette change
 * updates one file.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  getAnalyticsOverview,
  getAnalyticsTrend,
  getAnalyticsByRole,
  getAnalyticsByDifficulty,
  getAnalyticsSourceMix,
  getAnalyticsFeedbackThemes,
  type OverviewMetrics,
  type ScoreTrendPoint,
  type RolePerformance,
  type DifficultyPerformance,
  type SourceMix,
  type FeedbackTheme,
} from '../../lib/api';
import { ScoreTrendChart } from './ScoreTrendChart';
import { RoleBarChart } from './RoleBarChart';
import { DifficultyBarChart } from './DifficultyBarChart';
import { SourceMixDonut } from './SourceMixDonut';
import { FeedbackThemesList } from './FeedbackThemesList';
import { EmptyAnalyticsState } from './EmptyAnalyticsState';

interface AnalyticsState {
  overview: OverviewMetrics | null;
  trend: ScoreTrendPoint[];
  byRole: RolePerformance[];
  byDifficulty: DifficultyPerformance[];
  sourceMix: SourceMix[];
  strengths: FeedbackTheme[];
  weaknesses: FeedbackTheme[];
}

const EMPTY: AnalyticsState = {
  overview: null,
  trend: [],
  byRole: [],
  byDifficulty: [],
  sourceMix: [],
  strengths: [],
  weaknesses: [],
};

function Tile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  // Accent name kept for API stability, but now maps onto the neon
  // brand gradient stops instead of the legacy primary-blue palette.
  accent?: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const colorMap: Record<string, string> = {
    // blue / "primary" → the violet→cyan gradient, used for the
    // headline metric (avg score).
    blue: 'text-gradient-neon-static',
    // green → cyan (matches the AI source mix's gemini green).
    green: 'text-neon-cyan',
    // purple → violet2.
    purple: 'text-neon-violet2',
    // amber → magenta (the "Pro" / paid-plan hue from pricing).
    amber: 'text-neon-magenta',
  };
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      {/* Two soft orbs per tile so the row of KPIs picks up the same
          aurora feel as the rest of the app. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-neon-violet/15 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-neon-cyan/10 blur-2xl"
      />
      <div className="relative text-eyebrow text-neon-ink3">{label}</div>
      <div
        className={`type-display relative mt-2 text-display-l ${
          accent ? colorMap[accent] : 'text-neon-ink'
        }`}
      >
        {value}
      </div>
      {hint && <div className="relative mt-1 text-mono text-neon-ink3">{hint}</div>}
    </div>
  );
}

function formatScore(n: number | null): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}/10`;
}

export function AnalyticsDashboard() {
  const { getToken } = useAuth();
  const [state, setState] = useState<AnalyticsState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          overview,
          trend,
          byRole,
          byDifficulty,
          sourceMix,
          strengths,
          weaknesses,
        ] = await Promise.all([
          getAnalyticsOverview(getToken),
          getAnalyticsTrend(30, getToken),
          getAnalyticsByRole(getToken),
          getAnalyticsByDifficulty(getToken),
          getAnalyticsSourceMix(getToken),
          getAnalyticsFeedbackThemes('strengths', getToken),
          getAnalyticsFeedbackThemes('weaknesses', getToken),
        ]);
        if (!cancelled) {
          setState({ overview, trend, byRole, byDifficulty, sourceMix, strengths, weaknesses });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? 'Failed to load analytics');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (loading) {
    return (
      <div className="glass rounded-2xl p-12 text-center text-body-m text-neon-ink2">
        <div className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
          />
          Loading analytics…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-neon-magenta/40 bg-neon-magenta/10 p-4 text-body-m text-neon-ink">
        <strong className="text-neon-magenta">Failed to load analytics.</strong>{' '}
        <span className="text-neon-ink2">{error}</span>
      </div>
    );
  }

  const overview = state.overview!;
  if (overview.completedSessions === 0) {
    return <EmptyAnalyticsState />;
  }

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile
          label="Avg score"
          value={formatScore(overview.avgOverallScore)}
          hint={`${overview.totalEvaluations} evaluations`}
          accent="blue"
        />
        <Tile
          label="Completed"
          value={String(overview.completedSessions)}
          hint={`${overview.totalQuestions} questions answered`}
        />
        <Tile
          label="Streak"
          value={overview.currentStreakDays === 0 ? '—' : `${overview.currentStreakDays}d`}
          hint={overview.currentStreakDays === 0 ? 'No active streak' : 'Consecutive days'}
          accent="amber"
        />
        <Tile
          label="Best role"
          value={overview.bestRole ? overview.bestRole.role : '—'}
          hint={overview.bestRole ? `Avg ${overview.bestRole.avgScore.toFixed(1)}/10` : 'Need 2+ sessions'}
          accent="purple"
        />
      </div>

      {/* Score trend (full width) */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-display text-display-s text-neon-ink">Score trend</h3>
          <span className="text-mono text-neon-ink3">Last 30 days</span>
        </div>
        <ScoreTrendChart data={state.trend} />
      </div>

      {/* Two charts side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-display text-display-s text-neon-ink">By target role</h3>
            <span className="text-mono text-neon-ink3">Top {state.byRole.length} by sessions</span>
          </div>
          {state.byRole.length === 0 ? (
            <p className="text-body-m text-neon-ink3">No data yet.</p>
          ) : (
            <RoleBarChart data={state.byRole} />
          )}
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-display text-display-s text-neon-ink">By difficulty</h3>
            <span className="text-mono text-neon-ink3">All-time avg</span>
          </div>
          <DifficultyBarChart data={state.byDifficulty} />
        </div>
      </div>

      {/* Source mix + themes */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-display text-display-s text-neon-ink">AI source mix</h3>
            <span className="text-mono text-neon-ink3">All evals</span>
          </div>
          <SourceMixDonut data={state.sourceMix} />
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-display text-display-s text-neon-cyan">Recurring strengths</h3>
            <span className="text-mono text-neon-ink3">Top 5</span>
          </div>
          <FeedbackThemesList kind="strengths" data={state.strengths} />
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-display text-display-s text-neon-magenta">Recurring weaknesses</h3>
            <span className="text-mono text-neon-ink3">Top 5</span>
          </div>
          <FeedbackThemesList kind="weaknesses" data={state.weaknesses} />
        </div>
      </div>
    </div>
  );
}
