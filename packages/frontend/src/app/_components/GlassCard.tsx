/** Canonical glass card — pages used to roll their own glass divs and the
 *  surface drifted, so one component owns border/padding/orbs.
 *  Variants: default (.glass), strong (+ shadow), flat (no shadow, nests in cards). */

import type { ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'default' | 'strong' | 'flat';

const VARIANT_CLASS: Record<Variant, string> = {
  default: 'glass',
  strong: 'glass-strong shadow-neon-soft',
  flat: 'rounded-2xl border border-neon-glass bg-neon-surface/40',
};

export function GlassCard({
  variant = 'default',
  withOrbs = false,
  className,
  children,
}: {
  variant?: Variant;
  withOrbs?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        VARIANT_CLASS[variant],
        withOrbs && 'relative overflow-hidden',
        className,
      )}
    >
      {withOrbs ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-neon-violet/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-neon-cyan/15 blur-3xl"
          />
        </>
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}
