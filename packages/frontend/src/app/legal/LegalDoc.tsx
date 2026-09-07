/**
 * LegalDoc — shared shell for the privacy policy and terms pages.
 * Long-form text in the brand chrome: sticky-ish header block, then
 * numbered sections with comfortable reading width.
 */

'use client';

import type { ReactNode } from 'react';
import { AppShell } from '../_components/AppShell';

export function LegalDoc({
  title,
  lead,
  updated,
  children,
}: {
  title: string;
  lead: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-16 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-eyebrow text-neon-ink3">Legal</div>
          <h1 className="type-display mt-2 text-display-l text-neon-ink">
            {title}
          </h1>
          <p className="mt-3 text-body-m text-neon-ink2">{lead}</p>
          <p className="mt-2 font-mono text-[0.72rem] text-neon-ink3">
            Last updated: {updated}
          </p>
          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </section>
    </AppShell>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="type-display text-display-s text-neon-ink">{heading}</h2>
      <div className="mt-2 space-y-3 text-body-m leading-relaxed text-neon-ink2">
        {children}
      </div>
    </section>
  );
}
