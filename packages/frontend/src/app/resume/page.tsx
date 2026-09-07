/**
 * Resume Upload page — upload a PDF / DOC / DOCX resume; the backend
 * stores it in Cloudinary and runs the LLM extraction pass. Uploaded
 * resumes appear in the list below the form and in the "Anchor to
 * your resume" dropdown on the interview setup page.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  listResumes,
  uploadResume,
  type ResumeProfile,
} from '../../lib/api';
import { AppShell } from '../_components/AppShell';
import { CenterMessage } from '../_components/CenterMessage';
import { ErrorNotice } from '../_components/ErrorNotice';

interface ResumeListItem {
  id: string;
  cloudinaryUrl: string;
  /** Null for rows stored before file names were persisted. */
  fileName: string | null;
  uploadedAt: string;
  resumeProfile: ResumeProfile | null;
}

const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export default function ResumePage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  // Load existing resumes on mount so the list under the form is
  // populated even before the user picks a file.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    setLoadingList(true);
    listResumes(getToken)
      .then((list) => {
        if (cancelled) return;
        setResumes(list as ResumeListItem[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Non-fatal — the form still works, we just can't show the
        // list. Surface it as a soft error at the top of the list
        // area rather than blocking the whole page.
        setError((err as Error).message ?? 'Failed to load existing resumes');
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <AppShell>
        <CenterMessage>Loading…</CenterMessage>
      </AppShell>
    );
  }
  if (!isSignedIn) {
    return (
      <AppShell>
        <CenterMessage>Please sign in to upload a resume.</CenterMessage>
      </AppShell>
    );
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(
        `That file is ${formatBytes(picked.size)} — the limit is ${formatBytes(MAX_BYTES)}.`,
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(picked);
  }

  async function onSubmit() {
    if (!file) {
      setError('Pick a file first.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await uploadResume(file, getToken);
      // Prepend the new resume so the user sees it at the top of
      // the list right after the upload completes — no need to wait
      // for the GET to round-trip.
      const newItem: ResumeListItem = {
        id: result.resumeId,
        cloudinaryUrl: result.cloudinaryUrl,
        fileName: result.fileName || file.name,
        // Synthesize an uploadedAt for the local list (the GET
        // response will return the canonical server timestamp on
        // next load). This is just so the list renders immediately.
        uploadedAt: new Date().toISOString(),
        resumeProfile: result.profile ?? null,
      };
      // Dedupe/replacement returns an existing id — move that entry to
      // the top instead of stacking a second copy of the same resume.
      setResumes((prev) => [newItem, ...prev.filter((r) => r.id !== result.resumeId)]);
      setSuccess(
        result.reused
          ? `${result.fileName || file.name} was already uploaded — reusing it, nothing new was stored.`
          : `Uploaded ${result.fileName || file.name} — attached as a tailored-question source.`,
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError((err as Error).message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-2xl">
          {/* Faint aurora behind the form on lg+ for the same
              warmth-as-light feel as the interview setup form. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden"
          >
            <div className="absolute inset-0 bg-aurora animate-aurora-spin opacity-50" />
            <div className="absolute right-1/3 top-1/3 h-72 w-72 rounded-full bg-neon-cyan/15 blur-3xl animate-orb-drift" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-neon-black" />
          </div>

          {/* Page heading — same eyebrow + display-l pattern as the
              dashboard, interview, and billing pages. */}
          <div className="mb-8">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse-dot"
              />
              Resume
            </span>
            <h1 className="type-display mt-3 text-display-l text-neon-ink sm:text-display-xl">
              Tailor the{' '}
              <span className="text-gradient-neon-static">first question</span>.
            </h1>
            <p className="mt-2 text-body-l text-neon-ink2">
              Upload your resume and we&apos;ll pull your projects and
              target role into the interviewer&apos;s opening line.
            </p>
          </div>

          {/* Upload card — same strong-glass + two-orb treatment as
              the interview setup form card. */}
          <div className="glass-strong shadow-neon-soft relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-neon-violet/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-neon-cyan/10 blur-3xl"
            />

            <div className="relative space-y-5">
              <Field
                label="Resume file"
                hint="PDF, DOC, or DOCX. Up to 8 MB."
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={onFileChange}
                  className="block w-full cursor-pointer rounded-lg border border-neon-glass bg-neon-black px-3 py-2.5 text-body-m text-neon-ink file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-neon-violet/20 file:px-3 file:py-1.5 file:text-body-m file:text-neon-ink hover:border-neon-violet/40 focus:border-neon-violet2 focus:outline-none focus:ring-2 focus:ring-neon-violet2/30"
                />
                {file && (
                  <p className="mt-2 font-mono text-[0.78rem] text-neon-ink3">
                    Selected: {file.name} · {formatBytes(file.size)}
                  </p>
                )}
              </Field>

              {error && (
                <ErrorNotice title="Upload failed">{error}</ErrorNotice>
              )}

              {success && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-2xl border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-3 text-body-m text-neon-ink"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-neon-cyan/60 text-[0.7rem] font-bold text-neon-cyan"
                  >
                    ✓
                  </span>
                  <span>{success}</span>
                </div>
              )}

              <button
                type="button"
                onClick={onSubmit}
                disabled={busy || !file}
                className="type-display inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {busy ? 'Uploading…' : 'Upload resume'}
                {!busy && file ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
          </div>

          {/* Already-uploaded list — shows on every visit so the
              user has visible feedback that the upload persisted. */}
          <div className="mt-8">
            <h2 className="mb-3 text-eyebrow text-neon-ink2">Uploaded resumes</h2>
            {loadingList ? (
              <p className="text-body-m text-neon-ink3">Loading…</p>
            ) : resumes.length === 0 ? (
              <p className="text-body-m text-neon-ink3">
                No resumes uploaded yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {resumes.map((r) => (
                  <li
                    key={r.id}
                    className="glass relative overflow-hidden rounded-2xl p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="type-display text-body-l text-neon-ink">
                          {r.fileName ?? 'Earlier resume'}
                        </div>
                        {r.resumeProfile?.name && (
                          <div className="mt-0.5 text-body-m text-neon-ink2">
                            {r.resumeProfile.name}
                            {r.resumeProfile.email
                              ? ` · ${r.resumeProfile.email}`
                              : ''}
                          </div>
                        )}
                        {r.resumeProfile?.summary && (
                          <p className="mt-2 text-body-m text-neon-ink3">
                            {r.resumeProfile.summary}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[0.7rem] text-neon-ink3">
                        {formatDate(r.uploadedAt)}
                      </span>
                    </div>
                    {r.resumeProfile &&
                      r.resumeProfile.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {r.resumeProfile.skills.slice(0, 8).map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center rounded-full border border-neon-glassHi bg-neon-surface/60 px-2.5 py-0.5 font-mono text-[0.7rem] text-neon-ink2"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

/** Labelled form field — same shape as the one in
 *  app/interview/page.tsx so the form chrome is consistent. Kept
 *  local rather than extracted into a shared component to avoid
 *  cross-package churn for a one-off field layout. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-eyebrow text-neon-ink2">
        {label}
      </label>
      {hint ? <p className="mb-3 text-body-m text-neon-ink3">{hint}</p> : null}
      {children}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
