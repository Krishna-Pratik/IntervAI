/**
 * Interview setup page: configure a new session (role, duration,
 * difficulty, optional JD/company, required resume), then navigate to
 * the live interview. Shows the trial-remaining indicator and a
 * limit-reached banner from the access-decision endpoint.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import clsx from 'clsx';
import {
  createInterviewSession,
  getAccessDecision,
  listResumes,
  uploadResume,
  type AccessDecision,
} from '../../lib/api';
import { AppShell } from '../_components/AppShell';
import { ErrorNotice } from '../_components/ErrorNotice';

type Difficulty = 'easy' | 'medium' | 'hard';

// The AI planner derives the question count from the picked duration.
const DURATION_OPTIONS = [15, 30, 45, 60] as const;

// Keep in sync with the backend zod cap (interview.schema.ts).
const JD_MAX_CHARS = 5000;

const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Keep in sync with RESUME_UPLOAD_LIMITS.maxBytes on the backend —
// a mismatch means the frontend accepts files the backend rejects (413).
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function InterviewSetupPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [targetRole, setTargetRole] = useState('Senior Software Engineer');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [jobDescription, setJobDescription] = useState('');
  const [company, setCompany] = useState('');
  // Required — the AI plans the whole interview from the selected
  // resume's parsed profile. '' keeps Start disabled.
  const [resumeId, setResumeId] = useState<string>('');
  const [resumes, setResumes] = useState<
    Array<{ id: string; fileName: string | null; uploadedAt?: string }>
  >([]);
  // Inline upload — mirrors the /resume page so candidates can drop a
  // file without leaving setup.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessDecision | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    getAccessDecision(getToken)
      .then(setAccess)
      .catch(() => {
        // Non-fatal — the indicator is just hidden.
      });
    listResumes(getToken)
      .then((list) =>
        setResumes(
          list.map((r) => ({
            id: r.id,
            fileName: r.fileName,
            uploadedAt: r.uploadedAt,
          })),
        ),
      )
      .catch(() => {
        // Non-fatal — empty picker, the upload CTA still works.
      });
  }, [isLoaded, isSignedIn, getToken]);

  // Redirect signed-out visitors to /sign-in, carrying the current
  // path so Clerk sends them back after sign-in. In an effect to avoid
  // "update during render" warnings.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const back = window.location.pathname + window.location.search;
      router.replace(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <AppShell>
        <CenterMessage>Loading…</CenterMessage>
      </AppShell>
    );
  }
  if (!isSignedIn) {
    // Redirect effect is in flight — don't flash the form meanwhile.
    return (
      <AppShell>
        <CenterMessage>Redirecting to sign in…</CenterMessage>
      </AppShell>
    );
  }

  // Validate a picked file and stage it; the upload fires on commitUpload.
  function stageFile(picked: File | null) {
    setUploadError(null);
    if (!picked) {
      setUploadFile(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setUploadError(
        `That file is ${formatBytes(picked.size)} — the limit is ${formatBytes(MAX_BYTES)}.`,
      );
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadFile(picked);
  }

  async function commitUpload(picked: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadResume(picked, getToken);
      const newItem = {
        id: result.resumeId,
        fileName: result.fileName || picked.name,
        uploadedAt: new Date().toISOString(),
      };
      // Filter-then-prepend: on a dedupe/replacement the server returns an
      // id already in the list, so we move the existing entry to the top
      // instead of stacking a second chip for the same resume.
      setResumes((prev) => [newItem, ...prev.filter((r) => r.id !== result.resumeId)]);
      // Auto-select — the whole point of inline upload is "drop → start".
      setResumeId(result.resumeId);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // preventDefault on both events is required — browsers reject drops by default.
  function onDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (!dropped) return;
    stageFile(dropped);
    // A drop means "upload it now"; picking another file replaces it.
    void commitUpload(dropped);
  }

  async function start() {
    if (targetRole.trim().length < 2) {
      setError('Please enter a target role (min 2 characters).');
      return;
    }
    if (!resumeId) {
      setError('Please upload or select a resume first — the interview is built around it.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await createInterviewSession(
        {
          targetRole: targetRole.trim(),
          difficulty,
          company: company.trim() || undefined,
          durationMinutes,
          jobDescription: jobDescription.trim() || undefined,
          resumeId,
        },
        getToken,
      );
      // Voice-first — the live (mic + camera) screen is the default entry.
      router.push(`/interview/${session.sessionId}/live`);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create session');
      setBusy(false);
    }
  }

  const limitReached = access?.reason === 'limit-reached';
  const isPro = access?.subscriptionStatus === 'active';

  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-2xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden"
          >
            <div className="absolute inset-0 bg-aurora animate-aurora-spin opacity-50" />
            <div className="absolute left-1/3 top-1/3 h-72 w-72 rounded-full bg-neon-violet/20 blur-3xl animate-orb-drift" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-neon-black" />
          </div>

          <div className="mb-8">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
              />
              New session
            </span>
            <h1 className="type-display mt-3 text-display-l text-neon-ink sm:text-display-xl">
              Configure your{' '}
              <span className="text-gradient-neon-static">mock interview</span>.
            </h1>
            <p className="mt-2 text-body-l text-neon-ink2">
              Pick a duration, add the role, company, and resume, and the
              AI designs a full interview flow — opening question, planned
              topics, follow-up probes — sized to your time.
            </p>
          </div>

          {/* Trial indicator + limit-reached banner */}
          {access && access.subscriptionStatus === 'free' && (
            <div
              className={clsx(
                'mb-6 flex flex-col gap-3 rounded-2xl border px-4 py-3 text-body-m backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:gap-3',
                limitReached
                  ? 'border-neon-magenta/40 bg-neon-magenta/10 text-neon-ink'
                  : 'border-neon-glassHi bg-neon-surface/60 text-neon-ink2',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={clsx(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    limitReached
                      ? 'bg-neon-magenta animate-pulse-dot'
                      : 'bg-neon-cyan',
                  )}
                />
                {limitReached
                  ? "You've used all your free trials."
                  : `${access.remainingFreeTrials} free ${
                      access.remainingFreeTrials === 1 ? 'trial' : 'trials'
                    } remaining.`}
              </span>
              <button
                onClick={() => router.push('/billing')}
                className="self-start text-body-m text-neon-ink underline-offset-4 transition-colors hover:text-neon-violet2 hover:underline sm:self-auto"
              >
                Upgrade →
              </button>
            </div>
          )}
          {isPro && (
            <div className="mb-6 flex items-center gap-2 rounded-full border border-neon-violet/40 bg-neon-violet/10 px-4 py-3 text-body-m text-neon-ink">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
              />
              Pro plan — unlimited sessions.
            </div>
          )}

          <div className="glass-strong shadow-neon-soft relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-neon-violet/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-neon-cyan/10 blur-3xl"
            />

            <div className="relative space-y-6">
              <Field
                label="Target role"
                required
                hint="What you're interviewing for."
              >
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="w-full rounded-lg border border-neon-glass bg-neon-black px-4 py-2.5 text-body-m text-neon-ink placeholder:text-neon-ink3 transition-colors focus:border-neon-violet2 focus:outline-none focus:ring-2 focus:ring-neon-violet2/30"
                />
              </Field>

              <Field
                label="Interview duration"
                required
                hint="Required — the AI designs a question flow that fits the time you pick."
              >
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map((mins) => {
                    const selected = durationMinutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationMinutes(mins)}
                        className={clsx(
                          'rounded-full border px-2 py-2.5 text-body-m transition-all sm:px-4',
                          selected
                            ? 'border-neon-violet2 bg-neon-violet/15 text-neon-ink shadow-neon-soft'
                            : 'border-neon-glass text-neon-ink2 hover:border-neon-violet/40 hover:text-neon-ink',
                        )}
                      >
                        {mins} min
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Difficulty">
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((d) => {
                    const selected = difficulty === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDifficulty(d)}
                        className={clsx(
                          'rounded-full border px-2 py-2.5 text-body-m capitalize transition-all sm:px-4',
                          selected
                            ? 'border-neon-violet2 bg-neon-violet/15 text-neon-ink shadow-neon-soft'
                            : 'border-neon-glass text-neon-ink2 hover:border-neon-violet/40 hover:text-neon-ink',
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Job description"
                hint="Optional — paste the JD and questions will target its requirements."
              >
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value.slice(0, JD_MAX_CHARS))}
                  placeholder="Paste the job description here…"
                  rows={4}
                  className="w-full resize-y rounded-lg border border-neon-glass bg-neon-black px-4 py-2.5 text-body-m text-neon-ink placeholder:text-neon-ink3 transition-colors focus:border-neon-violet2 focus:outline-none focus:ring-2 focus:ring-neon-violet2/30"
                />
                <p className="mt-1 text-right font-mono text-[0.7rem] text-neon-ink3">
                  {jobDescription.length}/{JD_MAX_CHARS}
                </p>
              </Field>

              <Field
                label="Target company"
                hint="We'll match their interview style."
              >
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Google, Razorpay, Atlassian"
                  className="w-full rounded-lg border border-neon-glass bg-neon-black px-4 py-2.5 text-body-m text-neon-ink placeholder:text-neon-ink3 transition-colors focus:border-neon-violet2 focus:outline-none focus:ring-2 focus:ring-neon-violet2/30"
                />
              </Field>

              <Field
                label="Resume"
                required
                hint="The interviewer builds your questions around your real projects, skills and experience."
              >
                <div className="space-y-3">
                  {/* Doubles as a browse button — the label triggers the hidden file input. */}
                  <label
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={clsx(
                      'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-all',
                      isDragging
                        ? 'border-neon-violet2 bg-neon-violet/10'
                        : 'border-neon-glass bg-neon-black/40 hover:border-neon-violet/40 hover:bg-neon-black/60',
                      uploading && 'pointer-events-none opacity-60',
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        stageFile(picked);
                        if (picked) void commitUpload(picked);
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neon-glassHi bg-neon-surface/60 text-neon-violet2"
                    >
                      ↑
                    </span>
                    <span className="text-body-m text-neon-ink">
                      {isDragging
                        ? 'Drop to upload'
                        : uploading
                          ? 'Uploading…'
                          : uploadFile
                            ? `Uploading ${uploadFile.name}…`
                            : 'Drop your resume here, or click to upload'}
                    </span>
                    <span className="font-mono text-[0.7rem] text-neon-ink3">
                      PDF / DOC / DOCX · up to {formatBytes(MAX_BYTES)}
                    </span>
                  </label>

                  {uploadError && (
                    <p className="text-body-m text-neon-magenta">
                      {uploadError}
                    </p>
                  )}

                  {/* Or pick an already-uploaded resume */}
                  {resumes.length > 0 && (
                    <div>
                      <p className="mb-2 text-eyebrow text-neon-ink2">
                        Or pick one you uploaded earlier
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {resumes.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setResumeId(r.id)}
                            className={clsx(
                              'rounded-full border px-3 py-1.5 text-body-m transition-colors',
                              resumeId === r.id
                                ? 'border-neon-violet2 bg-neon-violet/15 text-neon-ink'
                                : 'border-neon-glass text-neon-ink2 hover:border-neon-violet/40 hover:text-neon-ink',
                            )}
                          >
                            {r.fileName ?? 'Earlier resume'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Field>

              {error && (
                <ErrorNotice title="Couldn't create session">{error}</ErrorNotice>
              )}

              <button
                type="button"
                onClick={start}
                disabled={busy || limitReached || !resumeId}
                title={!resumeId ? 'Upload or select a resume to start' : undefined}
                className="type-display inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {limitReached
                  ? 'Trial limit reached — upgrade to continue'
                  : busy
                    ? 'Creating session…'
                    : !resumeId
                      ? 'Upload a resume to start'
                      : 'Start interview'}
                {!busy && !limitReached && resumeId ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

/** Labelled form field; `required` renders a violet asterisk next to the label. */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-eyebrow text-neon-ink2">
        {label}
        {required ? <span className="ml-1 text-neon-violet2">*</span> : null}
      </label>
      {hint ? <p className="mb-3 text-body-m text-neon-ink3">{hint}</p> : null}
      {children}
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-2xl">
        <div className="glass rounded-2xl p-12 text-center text-body-m text-neon-ink2">
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
