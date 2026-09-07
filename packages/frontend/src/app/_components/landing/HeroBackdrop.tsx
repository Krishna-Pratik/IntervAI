'use client';

/**
 * HeroBackdrop — the visual world behind the hero.
 *
 * Three layers, painted in z-order:
 *   1. Base near-black (#0A0A12) — set on the parent, this just adds the
 *      subtle grid pattern.
 *   2. Aurora — a slow-rotating conic gradient of violet/cyan/magenta,
 *      heavily blurred and masked to a soft bloom at the top-center.
 *   3. Particles — ~80 dots that drift slowly toward the cursor, drawn
 *      on a canvas. The dots repel slightly from the mouse so the field
 *      feels alive but never noisy.
 *
 * Performance:
 *   - The canvas is `position: absolute` and `pointer-events: none`.
 *   - We only paint on requestAnimationFrame, capped at 60fps.
 *   - The particle count is fixed at 80; each is a 1.5px circle.
 *   - We bail out completely on prefers-reduced-motion (just the static
 *     aurora, no drift).
 *
 * The component is self-contained: it owns its own size and only needs
 * to be placed inside a `relative overflow-hidden` container.
 */

import { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 80;
const COLORS = ['#A855F7', '#06B6D4', '#EC4899', '#E5E7EB'] as const;
const MOUSE_RADIUS = 140; // px — particles within this distance feel the cursor
const MOUSE_FORCE = 0.6;  // how strongly the cursor attracts/repels

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  baseAlpha: number;
};

function makeParticles(w: number, h: number): Particle[] {
  // Pseudo-random but deterministic so the field looks the same across
  // hot-reloads (no "flicker" while developing).
  const seed = (i: number) => {
    const x = Math.sin(i * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  };

  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const color = COLORS[Math.floor(seed(i + 1) * COLORS.length)] ?? '#E5E7EB';
    return {
      x: seed(i + 11) * w,
      y: seed(i + 23) * h,
      vx: (seed(i + 37) - 0.5) * 0.15,
      vy: (seed(i + 53) - 0.5) * 0.15,
      r: 0.6 + seed(i + 71) * 1.2,
      color,
      baseAlpha: 0.25 + seed(i + 89) * 0.45,
    };
  });
}

export function HeroBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const mouse = { x: -9999, y: -9999 };
    let particles: Particle[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = makeParticles(w, h);
    };
    resize();

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        // Ambient drift.
        if (!reducedMotion.current) {
          p.x += p.vx;
          p.y += p.vy;
        }

        // Mouse interaction — attract gently then repel when very close.
        if (mouse.x > -1000) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MOUSE_RADIUS && dist > 0) {
            const f = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE;
            p.x += (dx / dist) * f * 0.4;
            p.y += (dy / dist) * f * 0.4;
          }
        }

        // Wrap edges so the field stays populated.
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.baseAlpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseout', onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Layer 1 — subtle grid. Sits on top of the body bg, below everything. */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(229,231,235,0.6) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(229,231,235,0.6) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%)',
        }}
      />

      {/* Layer 2 — aurora bloom. The aurora-spin animation rotates the
          gradient continuously, and the radial mask keeps it concentrated
          at the top of the hero. */}
      <div className="absolute -top-[20%] left-1/2 h-[120vh] w-[140vw] -translate-x-1/2 bg-aurora motion-safe:animate-aurora-spin" />

      {/* Layer 3 — three soft orbs of different colours, drifting slowly.
          Opacities are pushed up so they read against the dark bg; the
          blur keeps them feeling like ambient light, not solid shapes. */}
      <div className="absolute left-[5%] top-[15%] h-[28rem] w-[28rem] rounded-full bg-neon-violet/55 blur-3xl motion-safe:animate-orb-drift" />
      <div
        className="absolute right-[5%] top-[35%] h-[32rem] w-[32rem] rounded-full bg-neon-cyan/45 blur-3xl motion-safe:animate-orb-drift"
        style={{ animationDelay: '-5s' }}
      />
      <div
        className="absolute left-[35%] top-[55%] h-[24rem] w-[24rem] rounded-full bg-neon-magenta/40 blur-3xl motion-safe:animate-orb-drift"
        style={{ animationDelay: '-9s' }}
      />

      {/* Layer 4 — particles. Canvas covers the full hero area. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
