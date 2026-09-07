/** Loading / waiting-on-auth state for auth-gated pages, shown while the
 *  Clerk session is still resolving. */

import type { ReactNode } from 'react';

export function CenterMessage({ children }: { children: ReactNode }) {
  return (
    <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <div className="glass rounded-2xl p-8 text-center text-body-m text-neon-ink2 sm:p-12">
          <div className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
            />
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
