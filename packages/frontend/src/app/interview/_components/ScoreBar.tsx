/**
 * ScoreBar — horizontal labeled bar for the evaluation card's
 * "Detailed scores" list. The caller alternates the accent
 * row-by-row (violet/cyan) so the column reads as a related set,
 * not a stack of identical bars.
 */

import clsx from 'clsx';

type Accent = 'violet' | 'cyan';

const BAR_GRADIENT: Record<Accent, string> = {
  violet: 'bg-gradient-to-r from-neon-violet to-neon-magenta',
  cyan: 'bg-gradient-to-r from-neon-cyan to-neon-violet',
};

export function ScoreBar({
  label,
  value,
  accent,
  widthClass = 'w-28',
}: {
  label: string;
  value: number;
  accent: Accent;
  // `widthClass` lets the caller choose how wide the label column
  // is — the text page uses `w-28` for a tight two-column layout,
  // the voice page uses `w-24` because the value column gets
  // squeezed when "Growth" is the label.
  widthClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-body-m">
      <span className={clsx('capitalize text-neon-ink2', widthClass)}>{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neon-glass">
        <div
          className={clsx('h-full rounded-full', BAR_GRADIENT[accent])}
          style={{ width: `${Math.min(100, Math.max(0, value * 10))}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-neon-ink">{value}/10</span>
    </div>
  );
}
