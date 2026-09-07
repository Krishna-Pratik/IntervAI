/** Shared error surface so per-page error styling can't drift.
 *  Magenta is the brand's warning stop (same hue as the AI-source tag and
 *  trial-limit pill); pass `onRetry` to opt into the retry CTA. */

import type { ReactNode } from 'react';

export function ErrorNotice({
  title = 'Something went wrong',
  children,
  onRetry,
}: {
  title?: string;
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-neon-magenta/40 bg-neon-magenta/10 px-4 py-3 text-body-m text-neon-ink sm:flex-row sm:items-start"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-neon-magenta/60 text-[0.7rem] font-bold text-neon-magenta"
      >
        !
      </span>
      <div className="flex-1">
        <div className="font-medium text-neon-magenta">{title}</div>
        <div className="mt-0.5 text-neon-ink2">{children}</div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[36px] self-stretch rounded-full border border-neon-magenta/50 px-3 py-1 font-mono text-[0.78rem] text-neon-magenta transition-colors hover:bg-neon-magenta/15 sm:self-center sm:self-auto"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
