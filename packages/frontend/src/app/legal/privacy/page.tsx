/**
 * Privacy policy — what IntervAI stores and why. Kept honest and short
 * on purpose: the app really does store resumes and answer transcripts,
 * and the page should say so plainly.
 */

import { LegalDoc, LegalSection } from '../LegalDoc';

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy policy"
      lead="The short version: your resume and your interview answers belong to you. We store them to run the product, we don't sell them, and you can delete them."
      updated="6 September 2026"
    >
      <LegalSection heading="What we collect">
        <p>
          <strong className="text-neon-ink">Account data:</strong> your name,
          email and profile picture from the sign-in provider you choose.
        </p>
        <p>
          <strong className="text-neon-ink">Resume data:</strong> the resume
          file you upload (stored as a copy for re-download) and the parsed
          profile we extract from it — skills, experience, projects,
          education.
        </p>
        <p>
          <strong className="text-neon-ink">Interview data:</strong> the text
          transcripts of your spoken answers and the scores and feedback
          generated for them. Audio is converted to text in your browser;
          we store transcripts, not recordings.
        </p>
        <p>
          <strong className="text-neon-ink">Camera:</strong> your camera is
          for your own self-view while practicing. Video is never recorded or
          transmitted anywhere.
        </p>
        <p>
          <strong className="text-neon-ink">Billing data:</strong> payment
          status for your subscription. Card details go straight to our
          payment provider — they never touch our servers.
        </p>
      </LegalSection>

      <LegalSection heading="Why we collect it">
        <p>
          To generate interview questions tailored to your resume, score your
          answers, show your progress over time, and charge for paid plans.
          Nothing else. We do not sell personal data or share it with
          advertisers.
        </p>
      </LegalSection>

      <LegalSection heading="Who processes it">
        <p>
          A small set of trusted infrastructure providers handles sign-in,
          payments, cloud storage and the language-model calls that generate
          questions and feedback. Your resume profile and answer text are
          sent to the AI processing service needed to produce your questions
          and evaluation. We keep this list to the minimum the product needs.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Until you delete it. Resumes and sessions can be removed from
          within the product; deleting your account removes your stored data
          aside from what we are legally required to retain (for example,
          billing records).
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Traffic is encrypted in transit, access to production data is
          restricted, and tokens are never stored in our application code. No
          system is perfectly secure — if you have concerns, don&apos;t upload
          anything you wouldn&apos;t share with a normal recruiter.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          You can export nothing, delete everything, or close your account at
          any time — write to{' '}
          <a
            href="mailto:krishnapratik26@gmail.com"
            className="text-neon-violet2 underline underline-offset-4"
          >
            hello@intervai.app
          </a>
          . We&apos;ll confirm once it&apos;s done.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes materially, we&apos;ll update the date above.
          Continuing to use IntervAI after an update means accepting the
          revised policy.
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
