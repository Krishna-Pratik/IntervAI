/**
 * FeedbackThemesList — top recurring strengths and weaknesses across
 * all evaluations, as count-length bars. Strengths use cyan, weaknesses
 * magenta — the same hues as the dashboard card titles so bars and
 * heading read as one group; the track uses neon.glass to sit on the
 * card surface.
 */

'use client';

import type { FeedbackTheme } from '../../lib/api';

export function FeedbackThemesList({
  kind,
  data,
}: {
  kind: 'strengths' | 'weaknesses';
  data: FeedbackTheme[];
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-neon-ink3">
        No recurring {kind} yet. Complete a few interviews to see themes.
      </p>
    );
  }

  const max = Math.max(...data.map((d) => d.occurrences));

  // Strengths → cyan, weaknesses → magenta. The neon gradient has a
  // distinct stop for each, so the two list variants read as the
  // positive/negative pair the design system already uses elsewhere.
  const accent = kind === 'strengths' ? 'bg-neon-cyan' : 'bg-neon-magenta';
  const accentText = kind === 'strengths' ? 'text-neon-cyan' : 'text-neon-magenta';

  return (
    <ul className="space-y-3">
      {data.map((t) => (
        <li key={t.theme} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-neon-ink">{t.theme}</span>
            <span className={`font-mono text-[0.7rem] font-semibold ${accentText}`}>
              ×{t.occurrences}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neon-glass">
            <div
              className={`h-full ${accent}`}
              style={{ width: `${Math.round((t.occurrences / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
