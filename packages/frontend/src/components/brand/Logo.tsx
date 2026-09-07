/**
 * Cadence — the IntervAI brand lockup: five waveform bars that resolve into
 * the "I", swept with the landing gradient (#A855F7 → #06B6D4 → #EC4899),
 * beside the Sora wordmark.
 *
 * Gradient IDs come from useId so multiple instances on one page don't
 * collide; pass `tile` for the favicon-style dark rounded tile used in the
 * nav shells.
 */
import { useId } from 'react';

import clsx from 'clsx';

type LogoProps = {
  className?: string;
  /** Height of the mark in px; the wordmark type is driven by the parent's font classes. */
  markSize?: number;
  /** Wrap the bars in the dark rounded tile (nav/sign-in chrome). */
  tile?: boolean;
  /** Hide the "IntervAI" text, keeping the mark only. */
  markOnly?: boolean;
};

const BARS = [
  { x: 5, y: 25, h: 14 },
  { x: 17, y: 17, h: 30 },
  { x: 29, y: 10, h: 44 },
  { x: 41, y: 17, h: 30 },
  { x: 53, y: 25, h: 14 },
];

export function Logo({ className, markSize = 24, tile = false, markOnly = false }: LogoProps) {
  const id = useId();
  const gid = `cadence-${id}`;

  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 64 64"
        role="img"
        aria-label={markOnly ? 'IntervAI' : undefined}
        aria-hidden={markOnly ? undefined : true}
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gid} x1="5" y1="54" x2="59" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="50%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        {tile && <rect width="64" height="64" rx="14" fill="#0A0A12" />}
        <g fill={`url(#${gid})`}>
          {BARS.map((b) => (
            <rect key={b.x} x={b.x} y={b.y} width="6" height={b.h} rx="3" />
          ))}
        </g>
      </svg>
      {!markOnly && <span>IntervAI</span>}
    </span>
  );
}
