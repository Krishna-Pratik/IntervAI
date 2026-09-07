/**
 * ScoreRow — a single labeled score in the evaluation card's
 * summary grid. The accent keeps the two scores (Precision /
 * Growth) from reading as the same color.
 */

import clsx from 'clsx';

type Accent = 'violet' | 'cyan';

const VALUE_COLOR: Record<Accent, string> = {
  violet: 'text-neon-violet2',
  cyan: 'text-neon-cyan',
};

export function ScoreRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: Accent;
}) {
  return (
    <div className="rounded-xl border border-neon-glass bg-neon-surface/40 p-3">
      <div className="text-mono text-neon-ink3">{label}</div>
      <div className={clsx('type-display mt-1 text-display-s', VALUE_COLOR[accent])}>
        {value}
      </div>
    </div>
  );
}
