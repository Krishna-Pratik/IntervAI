'use client';

/**
 * InterviewCard3D — the centerpiece of the landing hero.
 *
 * A floating interview card that:
 *   - Tilts in 3D toward the mouse position (max ~10°).
 *   - Floats vertically on its own slow loop.
 *   - Has an inner highlight that tracks the cursor.
 *   - Renders a live Waveform + a sample transcript + a sample score,
 *     reusing the same "interview in progress" visual language as the
 *     actual interview screens on /interview.
 *
 * Why pure CSS 3D instead of three.js / react-three-fiber?
 *   - Three.js would add ~500kb gz to the bundle for a single effect.
 *   - CSS 3D with `transform-style: preserve-3d` and `perspective` on the
 *     parent gives us the same look in 0kb.
 *
 * The card content is "preview"-framed: "Sample" labels everywhere,
 * a pulsing dot indicating the playback is running, but the card is
 * pointer-events-none so it never gets mistaken for a live control.
 *
 * Reduced motion: tilts are disabled, only the float remains.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

const MAX_TILT = 10; // degrees — capped so the card never feels unstable

export function InterviewCard3D() {
  const ref = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  // Mouse position relative to the card center, in normalized [-1, 1].
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Spring the values so the tilt feels physical, not snappy.
  const sx = useSpring(x, { stiffness: 120, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 120, damping: 18, mass: 0.4 });

  // Convert to rotation. Yaw from x, pitch from y. Both directions, capped.
  const rotateY = useTransform(sx, [-1, 1], [-MAX_TILT, MAX_TILT]);
  const rotateX = useTransform(sy, [-1, 1], [MAX_TILT, -MAX_TILT]);

  // Highlight position — also follows the cursor, in %.
  const glowX = useTransform(sx, [-1, 1], ['20%', '80%']);
  const glowY = useTransform(sy, [-1, 1], ['20%', '80%']);

  // Detect reduced-motion up front.
  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
  }, []);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion.current) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    x.set(nx);
    y.set(ny);
  };

  const onLeave = () => {
    setHovering(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={onLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      className="perspective-1200 relative mx-auto w-full max-w-md"
    >
      <motion.div
        animate={
          reducedMotion.current
            ? {}
            : { y: hovering ? -4 : [0, -8, 0] }
        }
        transition={
          hovering || reducedMotion.current
            ? { duration: 0.4 }
            : { duration: 6, repeat: Infinity, ease: 'easeInOut' }
        }
        className="border-luminous relative rounded-2xl bg-neon-surface/80 p-1 backdrop-blur-md"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Cursor-following highlight */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background: useTransform(
              [glowX, glowY] as never,
              ([gx, gy]) =>
                `radial-gradient(circle 200px at ${gx} ${gy}, rgba(168,85,247,0.25), transparent 60%)`,
            ),
            opacity: hovering ? 1 : 0,
            transition: 'opacity 240ms ease',
          }}
        />

        <div className="rounded-xl bg-gradient-to-br from-neon-surface to-neon-black p-5">
          {/* Top chrome — "live" pill + sample question label */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
              />
              <span className="text-eyebrow text-neon-ink2">Live preview</span>
            </div>
            <span className="font-mono text-[0.7rem] text-neon-ink3">
              02:38 / 06:00
            </span>
          </div>

          {/* Question */}
          <div className="mt-4">
            <p className="type-display text-base text-neon-ink sm:text-lg">
              &ldquo;Design a URL shortener like bit.ly. Walk me through the
              API, the database schema, and how you&apos;d handle 10k
              writes per second.&rdquo;
            </p>
          </div>

          {/* Live waveform — a CSS-driven visualization that pulses. */}
          <div className="mt-5 flex items-end gap-[2px] h-12">
            {Array.from({ length: 36 }).map((_, i) => {
              const base = 0.25 + ((i * 37) % 100) / 140;
              return (
                <span
                  key={i}
                  className="block w-[2px] rounded-full bg-gradient-to-t from-neon-violet to-neon-cyan"
                  style={{
                    height: `${base * 100}%`,
                    animation: `bar-${(i % 5) + 1} 1.4s ease-in-out ${
                      -(i * 0.07).toFixed(2)
                    }s infinite alternate`,
                  }}
                />
              );
            })}
          </div>

          {/* Transcript snippet */}
          <div className="mt-4 rounded-lg border border-neon-glass bg-neon-black/40 p-3">
            <div className="text-eyebrow mb-1.5 text-neon-ink3">
              Captured answer
            </div>
            <p className="font-mono text-[0.78rem] leading-relaxed text-neon-ink2">
              &ldquo;The core is a write-heavy mapping: short code → long
              URL. I&apos;d start with a base-62 encoding of an auto-
              increment ID so the codes stay short and predictable. For
              10k writes/sec, I&apos;d put writes on a single primary
              behind a queue, then fan out reads to replicas with the
              short code as a cache key. The key trade-off is collision
              handling — I&apos;d rather retry with a new ID than build a
              distributed ID service, unless read latency demands it.&rdquo;
            </p>
          </div>

          {/* Score row */}
          <div className="mt-4 flex items-center justify-between border-t border-neon-glass pt-3">
            <div className="flex items-center gap-2">
              <span className="text-eyebrow text-neon-ink3">Score</span>
              <span className="type-display text-2xl text-neon-ink">8.4</span>
              <span className="text-sm text-neon-ink2">/10</span>
            </div>
            <div className="flex items-center gap-1.5">
              {['Structure', 'Specific', 'Composed'].map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-neon-glass bg-neon-violet/10 px-2.5 py-0.5 text-[0.72rem] tracking-wide text-neon-violet2"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* The keyframes for the 36 bars — local to this component so we
          don't pollute globals.css. */}
      <style jsx>{`
        @keyframes bar-1 { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
        @keyframes bar-2 { from { transform: scaleY(0.55); } to { transform: scaleY(0.95); } }
        @keyframes bar-3 { from { transform: scaleY(0.3); } to { transform: scaleY(0.7); } }
        @keyframes bar-4 { from { transform: scaleY(0.65); } to { transform: scaleY(0.35); } }
        @keyframes bar-5 { from { transform: scaleY(0.45); } to { transform: scaleY(0.85); } }
      `}</style>
    </motion.div>
  );
}
