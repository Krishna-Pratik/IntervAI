/**
 * Terms of service — standard product terms in plain language.
 */

import { LegalDoc, LegalSection } from '../LegalDoc';

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of service"
      lead="The rules of the road for using IntervAI. Plain language, but legally ordinary — if anything here conflicts with a formal agreement you've signed with us, the formal agreement wins."
      updated="6 September 2026"
    >
      <LegalSection heading="Who can use IntervAI">
        <p>
          You must be at least 16 years old and able to form a binding
          contract. If you're using it on behalf of a company or university,
          you're accepting these terms for them too.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          Keep your sign-in credentials safe — you're responsible for what
          happens under your account. Tell us promptly about any misuse.
        </p>
      </LegalSection>

      <LegalSection heading="The free tier and paid plans">
        <p>
          Free accounts can run trial interviews within a small monthly
          allowance. Paid plans unlock unlimited practice sessions.
          Subscriptions renew automatically until cancelled, and you can
          cancel at any time from the Billing page — you keep access until
          the end of the period you paid for.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Use IntervAI to practice interviews. Don&apos;t abuse the service:
          no reverse engineering, no scraping the AI for bulk content
          generation, no uploading unlawful or infringing material, and no
          attempts to disrupt the service for others. We can suspend accounts
          that break these rules.
        </p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          Your resume and your answers stay yours. You grant us only the
          limited license needed to run the product — parsing your resume,
          generating feedback, and showing you your history.
        </p>
      </LegalSection>

      <LegalSection heading="No guarantee of interview outcomes">
        <p>
          IntervAI gives practice and feedback. AI-generated scores are our
          best-effort coaching, not a predictor of real hiring results, and
          no plan promises that using IntervAI will get you a job or a
          specific outcome.
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          We're liable to you for problems with the service up to the amount
          you paid us in the twelve months before the claim. We aren't liable
          for indirect losses like missed opportunities — that would swallow
          a practice tool whole.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          We may update these terms; material changes get a note on this page
          with a new date. Questions:{' '}
          <a
            href="mailto:krishnapratik26@gmail.com"
            className="text-neon-violet2 underline underline-offset-4"
          >
            hello@intervai.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
