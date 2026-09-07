/**
 * LiveWaveform — 32-bar animated waveform for the listening card.
 * Bars have varied base heights and staggered `wave` animation
 * delays so the row reads as motion, not a synchronized blink.
 * Flat + dim while not listening.
 *
 * Decorative only — no real audio analysis behind it (the mic
 * level indicator lives on the CameraCard via useSpeechDetection).
 */

import clsx from 'clsx';

const BAR_COUNT = 32;

// Pre-compute a pseudo-random height for each bar so the spectrum
// looks organic and doesn't repeat on every render. The array is
// stable for the component's lifetime.
const HEIGHTS: number[] = Array.from({ length: BAR_COUNT }, (_, i) => {
  // Mix two sine waves for a natural-looking envelope.
  const t = i / BAR_COUNT;
  const h =
    0.45 + // baseline
    0.35 * Math.abs(Math.sin(t * Math.PI * 2.3)) +
    0.2 * Math.abs(Math.sin(t * Math.PI * 5.1 + 1.2));
  // Clamp to a sane range so very short / very tall bars are rare.
  return Math.max(0.18, Math.min(1, h));
});

export function LiveWaveform({ listening }: { listening: boolean }) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="flex h-12 items-end justify-center gap-[3px]"
    >
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={clsx(
            'w-[3px] rounded-full bg-neon-violet2 origin-bottom transition-opacity duration-200',
            listening ? 'opacity-80 animate-wave' : 'opacity-30',
          )}
          style={{
            height: `${h * 100}%`,
            // Each bar is offset in time so the row reads as a
            // moving waveform, not a synchronized blink.
            animationDelay: listening ? `${(i * 60) % 1000}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
