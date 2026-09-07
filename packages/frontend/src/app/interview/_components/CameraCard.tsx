/**
 * CameraCard — the user's self-view in the live interview screen.
 * A 16:9 glass card with <video> when the camera is on, a
 * placeholder otherwise. Permission states:
 *   - 'unknown' → not yet asked; "requesting" placeholder
 *   - 'granted' → live <video> with srcObject=stream
 *   - 'denied'  → browser blocked; "blocked" card with Try-again
 *   - 'off'     → user toggled off; "Camera off" card
 * Self-view is mirrored (scaleX(-1)) like Zoom/Meet; a single "live"
 * pill sits top-right while recording, and an in-panel camera
 * on/off toggle sits bottom-right for mid-call use.
 */

import { useEffect, useRef } from 'react';

export type CameraPermission = 'unknown' | 'granted' | 'denied' | 'off';

export function CameraCard({
  stream,
  permission,
  recording,
  isSpeaking,
  onRequest,
  onTurnOff,
  onTurnOn,
  compact = false,
}: {
  stream: MediaStream | null;
  permission: CameraPermission;
  recording: boolean;
  /** Shows a "live" mic-wave badge top-right while the mic hears speech. */
  isSpeaking: boolean;
  /** Called when the user clicks "Turn on camera" or "Try again." */
  onRequest: () => void;
  /** Wires a "stop the stream" affordance from outside the card. */
  onTurnOff?: () => void;
  /** Re-acquires the camera after the user turned it off in-card. */
  onTurnOn?: () => void;
  /** Picture-in-picture mode: small fixed-size shell (~200×150) used
   *  when the camera is an overlay on the question card rather than
   *  the page's primary content. Shrinks the badges, drops the full
   *  Placeholder CTA (the parent card has its own "turn on camera"
   *  affordance), and rounds the corners less so the small frame
   *  doesn't look too heavy. */
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach the MediaStream to the <video> element whenever it
  // changes. The video element is always in the DOM (so React
  // doesn't re-mount it and lose the play state) — we just toggle
  // the srcObject.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (permission === 'granted' && stream) {
      if (el.srcObject !== stream) el.srcObject = stream;
      el.play().catch(() => {
        // Autoplay can fail silently on some browsers; the user
        // can still click the video to start playback.
      });
    } else {
      el.srcObject = null;
    }
  }, [stream, permission]);

  return (
    <div
      className={
        compact
          ? // PiP shell — small fixed footprint, reads as an overlay.
            'glass-strong shadow-neon-soft relative overflow-hidden rounded-2xl ring-1 ring-neon-violet/20'
          : 'glass-strong shadow-neon-soft relative overflow-hidden rounded-3xl'
      }
      style={compact ? { width: '200px', aspectRatio: '4 / 3' } : undefined}
    >
      <div
        className={
          compact
            ? 'relative h-full w-full'
            : 'relative aspect-video w-full'
        }
      >
        {permission === 'granted' && stream ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              // Mirrored self-view — the natural frame of reference
              // every video-call app uses. No toggle.
              className="h-full w-full object-cover -scale-x-100"
            />

            {/* Top-left "cam" badge. */}
            <span
              className={
                compact
                  ? 'absolute left-1.5 top-1.5 rounded-full border border-neon-glassHi bg-neon-black/70 px-1.5 py-0.5 font-mono text-[0.55rem] text-neon-ink2 backdrop-blur'
                  : 'absolute left-3 top-3 rounded-full border border-neon-glassHi bg-neon-black/60 px-2 py-0.5 font-mono text-[0.7rem] text-neon-ink2 backdrop-blur'
              }
            >
              cam
            </span>

            {/* Top-right status badge — one "live" pill while recording
                (a separate rec dot was redundant: recording is exactly
                what live means here). Lights cyan while the mic hears
                speech, dims while quiet. */}
            <div
              className={
                compact
                  ? 'absolute right-1.5 top-1.5 flex flex-col items-end gap-1'
                  : 'absolute right-3 top-3 flex flex-col items-end gap-1.5'
              }
            >
              {recording ? (
                <span
                  className={
                    compact
                      ? `inline-flex items-center gap-1 rounded-full border bg-neon-black/70 px-1.5 py-0.5 font-mono text-[0.55rem] backdrop-blur ${isSpeaking ? 'border-neon-cyan/40 text-neon-cyan' : 'border-neon-glassHi text-neon-ink3'}`
                      : `inline-flex items-center gap-1.5 rounded-full border bg-neon-black/60 px-2 py-0.5 font-mono text-[0.7rem] backdrop-blur ${isSpeaking ? 'border-neon-cyan/40 text-neon-cyan' : 'border-neon-glassHi text-neon-ink3'}`
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="9"
                    height="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <path d="M12 18v3" />
                    <path d="M8 21h8" />
                    <path d="M17 8c1.2 1 1.2 4 0 5" opacity="0.7">
                      <animate
                        attributeName="opacity"
                        values="0.4;1;0.4"
                        dur="0.9s"
                        repeatCount="indefinite"
                      />
                    </path>
                    <path d="M19.5 6c1.8 1.5 1.8 7 0 8.5" opacity="0.5">
                      <animate
                        attributeName="opacity"
                        values="0.3;0.9;0.3"
                        dur="1.1s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </svg>
                  live
                </span>
              ) : null}
            </div>

            {/* Mid-call camera control, overlaid on the self-view itself
                so the user never has to hunt for it outside the panel. */}
            {onTurnOff ? (
              <button
                type="button"
                onClick={onTurnOff}
                aria-label="Turn camera off"
                title="Turn camera off"
                className={
                  compact
                    ? 'absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-neon-glassHi bg-neon-black/70 text-neon-ink2 backdrop-blur transition-colors hover:border-neon-magenta/50 hover:text-neon-magenta'
                    : 'absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neon-glassHi bg-neon-black/60 text-neon-ink2 backdrop-blur transition-colors hover:border-neon-magenta/50 hover:text-neon-magenta'
                }
              >
                <CamOffIcon size={compact ? 13 : 16} />
              </button>
            ) : null}
          </>
        ) : (
          <>
            <Placeholder
              permission={permission}
              onRequest={onRequest}
              compact={compact}
            />
            {/* When the user turned the camera off, the on-switch lives
                on the panel too — even in compact PiP mode, because
                this is a mid-call control, not a setup CTA. */}
            {permission === 'off' && onTurnOn ? (
              <button
                type="button"
                onClick={onTurnOn}
                aria-label="Turn camera on"
                title="Turn camera on"
                className={
                  compact
                    ? 'absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-neon-glassHi bg-neon-black/70 text-neon-ink2 backdrop-blur transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan'
                    : 'absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neon-glassHi bg-neon-black/60 text-neon-ink2 backdrop-blur transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan'
                }
              >
                <CamOnIcon size={compact ? 13 : 16} />
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The non-live state of the camera card. Same surface (glass
 * strong), same border, but no <video> — just a quiet
 * "off / blocked / loading" card with a single CTA.
 *
 * In compact (PiP) mode the CTA is suppressed: the parent
 * question card has its own "Turn on camera" affordance and we
 * don't want a button competing for taps inside a 200×150 box.
 */
function Placeholder({
  permission,
  onRequest,
  compact,
}: {
  permission: CameraPermission;
  onRequest: () => void;
  compact: boolean;
}) {
  const { title, body, cta } = PLACEHOLDER_COPY[permission];
  return (
    <div
      className={
        compact
          ? 'flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center'
          : 'flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center'
      }
    >
      <span
        aria-hidden="true"
        className={
          compact
            ? 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-neon-glassHi bg-neon-black/40 text-neon-ink3'
            : 'inline-flex h-12 w-12 items-center justify-center rounded-full border border-neon-glassHi bg-neon-black/40 text-neon-ink3'
        }
      >
        <svg
          viewBox="0 0 24 24"
          width={compact ? 12 : 22}
          height={compact ? 12 : 22}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
          <line x1="4" y1="4" x2="20" y2="20" />
        </svg>
      </span>

      <p
        className={
          compact
            ? 'font-mono text-[0.6rem] uppercase tracking-wider text-neon-ink3'
            : 'type-display text-display-s text-neon-ink'
        }
      >
        {compact ? (permission === 'denied' ? 'blocked' : 'cam off') : title}
      </p>
      {!compact ? <p className="max-w-xs text-body-m text-neon-ink2">{body}</p> : null}

      {!compact ? (
        <button
          type="button"
          onClick={onRequest}
          className="mt-1 min-h-[40px] rounded-full border border-neon-glassHi px-4 py-2 text-body-m text-neon-ink transition-colors hover:border-neon-violet/40 hover:text-white"
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}

/** Camera with a slash — the "turn off" glyph. */
function CamOffIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </svg>
  );
}

/** Plain camera — the "turn back on" glyph. */
function CamOnIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

const PLACEHOLDER_COPY: Record<
  CameraPermission,
  { title: string; body: string; cta: string }
> = {
  unknown: {
    title: 'Camera ready',
    body: 'Turn on your camera to add presence to the interview. Audio-only works too.',
    cta: 'Turn on camera',
  },
  off: {
    title: 'Camera off',
    body: 'The interview still works with audio only. You can turn the camera on at any time.',
    cta: 'Turn on camera',
  },
  denied: {
    title: 'Camera blocked',
    body: 'Camera access was blocked. Open your browser’s site settings to allow it, then refresh.',
    cta: 'Try again',
  },
  granted: {
    // Unreachable — granted state renders the <video> directly.
    title: '',
    body: '',
    cta: '',
  },
};
