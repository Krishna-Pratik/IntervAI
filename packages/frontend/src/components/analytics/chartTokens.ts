/**
 * Chart tokens — the colors and grid styling used by the Recharts
 * components on the dashboard.
 *
 * Why this file exists:
 *   Recharts only accepts literal string colors via its `stroke` /
 *   `fill` props — it can't read CSS variables or Tailwind classes.
 *   Without a shared token file, each chart was duplicating the same
 *   hex strings, with the usual drift (one chart used `#9CA3AF`,
 *   another used `#6B7280`, neither matched the Tailwind neon-ink
 *   tokens). Centralizing them here means a future palette change
 *   only updates one file.
 *
 * The values mirror the `neon.*` block in tailwind.config.js and
 * the related Clerk appearance maps. If those move, move these.
 */

export const CHART_TOKENS = {
  // Surfaces
  surface: '#0F0F1A', // tooltip / popover background — same as neon.surface
  black: '#0A0A12', // slice separators, ring outlines — same as neon.black
  // Text
  ink: '#E5E7EB', // tooltip body text
  ink2: '#9CA3AF', // tooltip label / y-axis labels
  ink3: '#6B7280', // x-axis tick labels
  // Hairlines
  axis: 'rgba(229, 231, 235, 0.12)', // axis lines + bar track outline
  grid: 'rgba(229, 231, 235, 0.06)', // gridline dashes
  // Brand
  violet: '#A855F7', // primary brand hue (the "main" signal)
  cyan: '#06B6D4', // secondary signal
  magenta: '#EC4899', // tertiary / warning
  // Brand gradients (used as Recharts `stroke="url(#id)"` references)
  // The IDs are stable so multiple charts can declare their own <defs>
  // without colliding.
  brandGradient: {
    id: 'neon-score-line',
    stops: [
      { offset: '0%', color: '#A855F7' },
      { offset: '50%', color: '#06B6D4' },
      { offset: '100%', color: '#EC4899' },
    ],
  },
  // Hover state
  hoverFill: 'rgba(168, 85, 247, 0.08)', // bar/area cursor fill
  cursorStroke: 'rgba(168, 85, 247, 0.35)', // line chart cursor
  // Tooltip shadow (reused across all 4 chart files)
  tooltipShadow:
    '0 0 0 1px rgba(229, 231, 235, 0.06),' +
    '0 20px 60px -20px rgba(0, 0, 0, 0.6)',
} as const;

/**
 * The 8-stop palette used by RoleBarChart. Adjacent roles need
 * different colors but the whole chart still needs to read as a
 * single family — the brand palette gives us that.
 */
export const ROLE_BAR_COLORS = [
  '#A855F7', // violet2 — primary
  '#06B6D4', // cyan
  '#EC4899', // magenta
  '#7C3AED', // violet
  '#22D3EE', // cyan-400
  '#F472B6', // pink-400
  '#8B5CF6', // violet-500
  '#2DD4BF', // teal-400
] as const;

/**
 * Difficulty → brand-gradient stop. The three difficulties map
 * to the three brand hues so the chart picks up the same
 * easy/medium/hard color rhythm as the rest of the
 * neon palette.
 */
export const DIFFICULTY_COLOR = {
  easy: '#06B6D4', // cyan (the "you got this" hue)
  medium: '#A855F7', // violet2 (the primary)
  hard: '#EC4899', // magenta (the "stretch" hue)
} as const;

/**
 * Source → brand-gradient stop. The donut slices and any future
 * source-tagged surface reuse this one mapping so colors never drift.
 */
export const SOURCE_COLOR = {
  gemini: '#06B6D4',
  openrouter: '#A855F7',
  deterministic: '#EC4899',
} as const;
