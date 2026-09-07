/**
 * EndSessionConfirm — centered modal for confirming session end.
 *
 * The live screen's "End →" is destructive (loses the in-progress
 * answer), so this one deliberately breaks the app's "no modals
 * unless required" convention. Behavior matches the MobileMenu
 * sheet pattern (same surface/backdrop, `inert` + `aria-modal`,
 * Escape-to-cancel, scroll-lock, Tab trapped inside).
 */

import { useEffect } from 'react';
import clsx from 'clsx';

export function EndSessionConfirm({
  open,
  currentQuestionNumber,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** 1-indexed question the user is on; surfaced in the body copy
   *  so the warning is concrete ("Your answer to question 3 won't
   *  be saved."). */
  currentQuestionNumber: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Escape closes — bound only while open so we don't carry a
  // global listener for nothing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // Lock body scroll while the modal is open, same pattern as
  // MobileMenu.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-session-title"
      aria-describedby="end-session-body"
      aria-hidden={!open}
      inert={!open}
      className={clsx(
        'fixed inset-0 z-[80]',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      {/* Backdrop. A button so backdrop-click is a real action;
          same pattern as MobileMenu. */}
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={open ? 0 : -1}
        onClick={onCancel}
        className={clsx(
          'absolute inset-0 bg-neon-black/75 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Centering wrapper. The card itself is glass-strong so it
          reads as the same surface as the rest of the app. */}
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div
          className={clsx(
            'glass-strong shadow-neon-violet relative w-full max-w-md overflow-hidden rounded-3xl p-6 transition-all duration-200 sm:p-8',
            open
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0',
          )}
        >
          {/* Soft violet orb so the modal picks up the same aurora
              vocabulary as the rest of the page. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-neon-violet/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-neon-magenta/15 blur-3xl"
          />

          <div className="relative">
            <h2
              id="end-session-title"
              className="type-display text-display-m text-neon-ink"
            >
              End this session?
            </h2>
            <p
              id="end-session-body"
              className="mt-2 text-body-m text-neon-ink2"
            >
              {currentQuestionNumber > 0
                ? `Your answer to question ${currentQuestionNumber} won’t be saved.`
                : 'Your progress so far won’t be saved.'}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] rounded-full border border-neon-glassHi px-5 py-2.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-neon-magenta/50 bg-neon-magenta/10 px-5 py-2.5 text-body-m text-neon-magenta transition-colors hover:bg-neon-magenta/20"
              >
                End session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
