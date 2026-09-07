/**
 * DifficultyBarChart — vertical bar chart of avg score per difficulty.
 * Always shows all three difficulties; empty bars use a dashed outline.
 *
 * The three difficulties map onto the three brand-gradient stops so
 * the chart picks up the cyan/violet/magenta easy/medium/hard
 * vocabulary the rest of the app uses.
 */

'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import type { DifficultyPerformance } from '../../lib/api';
import { CHART_TOKENS, DIFFICULTY_COLOR } from './chartTokens';

const DIFFICULTY_LABEL: Record<'easy' | 'medium' | 'hard', string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export function DifficultyBarChart({ data }: { data: DifficultyPerformance[] }) {
  const formatted = data.map((d) => ({
    label: DIFFICULTY_LABEL[d.difficulty],
    difficulty: d.difficulty,
    avgScore: d.avgScore ?? 0,
    sessionCount: d.sessionCount,
    color: DIFFICULTY_COLOR[d.difficulty],
  }));

  return (
    <ResponsiveContainer width="100%" height={288}>
      <BarChart data={formatted} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: CHART_TOKENS.ink2 }}
          stroke={CHART_TOKENS.axis}
        />
        <YAxis
          domain={[0, 10]}
          tick={{ fontSize: 11, fill: CHART_TOKENS.ink3 }}
          stroke={CHART_TOKENS.axis}
          width={32}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_TOKENS.surface,
            border: `1px solid ${CHART_TOKENS.axis}`,
            borderRadius: 8,
            fontSize: 13,
            color: CHART_TOKENS.ink,
            boxShadow: CHART_TOKENS.tooltipShadow,
          }}
          labelStyle={{ color: CHART_TOKENS.ink2 }}
          itemStyle={{ color: CHART_TOKENS.ink }}
          cursor={{ fill: CHART_TOKENS.hoverFill }}
          formatter={(value, _name, item) => {
            const num = typeof value === 'number' ? value : 0;
            const row = (item as { payload?: { sessionCount?: number } } | undefined)?.payload;
            const sessions = row?.sessionCount ?? 0;
            return [`${num.toFixed(1)}/10`, `Avg score (${sessions} sessions)`];
          }}
        />
        <Bar dataKey="avgScore" radius={[6, 6, 0, 0]}>
          {formatted.map((d) => (
            <Cell key={d.difficulty} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
