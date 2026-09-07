'use client';

/** Single shell for all authenticated pages so nav/footer re-skin once and
 *  every screen stays consistent. Body background lives in layout.tsx. */

import type { ReactNode } from 'react';
import { AppNav } from './AppNav';
import { AppFooter } from './Footer';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip text-neon-ink">
      <AppNav />
      <main className="relative">{children}</main>
      <AppFooter />
    </div>
  );
}
