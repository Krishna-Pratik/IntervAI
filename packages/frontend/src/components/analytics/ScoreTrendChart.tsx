/**
 * ScoreTrendChart — line chart of avg overallScore per day for the
 * last 30 days. Days with no data render as gaps (null) rather than 0,
 * so the user can see their activity pattern honestly.
 *
 * Color tokens are imported from ./chartTokens so a palette change
 * updates one file instead of five.
 */

'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { ScoreTrendPoint } from '../../lib/api';
import { CHART_TOKENS } from './chartTokens';

export function ScoreTrendChart({ data }: { data: ScoreTrendPoint[] }) {
  // Format the date as 'Sep 4' instead of '2026-09-04' for the x-axis.
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={288}>
      <LineChart data={formatted} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: CHART_TOKENS.ink3 }}
          stroke={CHART_TOKENS.axis}
          interval="preserveStartEnd"
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
          cursor={{ stroke: CHART_TOKENS.cursorStroke, strokeWidth: 1 }}
          formatter={(value) => {
            if (value == null || typeof value !== 'number') return ['—', 'Avg score'];
            return [`${value.toFixed(1)}/10`, 'Avg score'];
          }}
          labelFormatter={(label) => label}
        />
        <defs>
          <linearGradient id={CHART_TOKENS.brandGradient.id} x1="0" y1="0" x2="1" y2="0">
            {CHART_TOKENS.brandGradient.stops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke={`url(#${CHART_TOKENS.brandGradient.id})`}
          strokeWidth={2.5}
          dot={{ r: 3, fill: CHART_TOKENS.violet, stroke: CHART_TOKENS.black, strokeWidth: 1 }}
          activeDot={{ r: 5, fill: CHART_TOKENS.cyan, stroke: CHART_TOKENS.black, strokeWidth: 1 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
