/**
 * SourceMixDonut — donut of the primary / backup / heuristic mix,
 * using the shared SOURCE_COLOR tokens (cyan/violet/magenta). Slice
 * borders use the canvas color to keep adjacent segments distinct;
 * all-zero renders an empty-state message instead of a blank donut.
 */

'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { SourceMix } from '../../lib/api';
import { CHART_TOKENS, SOURCE_COLOR } from './chartTokens';

// User-facing labels stay vendor-neutral — the model mix is an internal
// routing detail, not something the candidate needs to see by name.
const SOURCE_LABEL: Record<'gemini' | 'openrouter' | 'deterministic', string> = {
  gemini: 'Primary model',
  openrouter: 'Backup model',
  deterministic: 'Heuristic',
};

export function SourceMixDonut({ data }: { data: SourceMix[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-neon-ink3">
        No evaluations yet.
      </div>
    );
  }

  const colored = data.map((d) => ({
    ...d,
    fill: SOURCE_COLOR[d.source],
  }));

  return (
    <div className="flex h-72 items-center gap-6">
      <div className="h-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={colored}
              dataKey="count"
              nameKey="source"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke={CHART_TOKENS.black}
              strokeWidth={1.5}
            >
              {colored.map((d) => (
                <Cell key={d.source} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3 text-sm">
        {colored.map((d) => (
          <div key={d.source} className="flex items-center gap-3">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: d.fill }}
            />
            <span className="text-neon-ink2">{SOURCE_LABEL[d.source]}</span>
            <span className="ml-auto font-medium text-neon-ink">
              {d.count} ({d.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
