/**
 * Root layout: ClerkProvider + fonts + Tailwind base.
 * Dark-mode only — the near-black canvas is hard-coded at the root
 * so even pages that don't opt in (404, marketing routes) get the
 * right background and text colour.
 */

import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  // We use the variable axes so a single family serves many weights/italics.
  axes: ['opsz', 'SOFT'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'IntervAI — A mock interview that listens back',
  description:
    'Practice role-specific questions with an AI that actually hears your answers, scores them like a real panel, and remembers your progress.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}
      >
        <body className="bg-neon-black text-neon-ink font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
