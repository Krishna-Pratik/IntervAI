/**
 * RoleBarChart — horizontal bar chart of avg score per target role.
 * Top 8 roles by session count. Renders empty state if no data.
 *
 * Color tokens are imported from ./chartTokens so the 8 bar colors
 * and the grid/tooltip styles are shared with the other charts.
 */

'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import type { RolePerformance } from '../../lib/api';
import { CHART_TOKENS, ROLE_BAR_COLORS } from './chartTokens';

export function RoleBarChart({ data }: { data: RolePerformance[] }) {
  // Replace nulls with 0 for chart rendering, but keep the original
  // for tooltip / label.
  const withDefault = data.map((d, i) => ({
    role: d.role,
    avgScore: d.avgScore ?? 0,
    sessionCount: d.sessionCount,
    color: ROLE_BAR_COLORS[i % ROLE_BAR_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, withDefault.length * 44 + 40)}>
      <BarChart
        data={withDefault}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
      >
        <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" />
        <XAxis
          type="number"
          domain={[0, 10]}
          tick={{ fontSize: 11, fill: CHART_TOKENS.ink3 }}
          stroke={CHART_TOKENS.axis}
        />
        <YAxis
          type="category"
          dataKey="role"
          width={140}
          tick={{ fontSize: 11, fill: CHART_TOKENS.ink2 }}
          stroke={CHART_TOKENS.axis}
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
        <Bar dataKey="avgScore" radius={[0, 6, 6, 0]}>
          {withDefault.map((d) => (
            <Cell key={d.role} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
