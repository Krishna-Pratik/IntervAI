/**
 * Clerk <SignIn /> appearance for the neon / aurora design system.
 *
 * Why a separate file: the mapping is styling noise that would bloat
 * the panel file, and the same map is reused by <SignUp />.
 *
 * Token source of truth: tailwind.config.js (`neon.*` block) and
 * globals.css (gradient/glass/shadow utilities). If a token moves
 * there, mirror it here — Clerk's appearance object only accepts
 * literal CSS values, not Tailwind classes or CSS variables.
 *
 * The re-skin: `elevation: 'flush'` strips Clerk's card chrome so the
 * form sits inside SignInShell's right panel; `logoPlacement: 'none'`
 * drops the Clerk logo (we carry our own wordmark); `variables` paint
 * colors/type/radius; `elements` refine the few surfaces Clerk's
 * internal CSS targets by class that `variables` can't reach.
 */

import type { SignIn } from '@clerk/nextjs';

/**
 * The shape Clerk's <SignIn /> expects on its `appearance` prop. We
 * derive it from the component so this file stays in sync if Clerk
 * renames or narrows the type.
 */
type SignInAppearance = NonNullable<
  Parameters<typeof SignIn>[0]['appearance']
>;

/**
 * Design-token mirror for the neon / aurora system.
 * Same approach as the previous ink/paper/amber version, just a
 * different palette. Keep in sync with tailwind.config.js's `neon.*`
 * block and globals.css's `.glass-strong` / `.shadow-neon-*` helpers.
 *
 * If we ever change the brand colors, BOTH places must move together.
 */
const TOKENS = {
  // Surfaces — true near-black, with a slightly raised card on top.
  black:    '#0A0A12',  // body / page — same as neon.black
  surface:  '#0F0F1A',  // elevated card surface — same as neon.surface
  // Brand gradient stops (the violet→cyan→magenta line used everywhere
  // in the app). We set `colorPrimary` to the violet so
  // Clerk picks a single hue for focus / links; the gradient is used
  // by the primary button via the elements override below.
  violet:   '#7C3AED',
  violet2:  '#A855F7',
  cyan:     '#06B6D4',
  magenta:  '#EC4899',
  // Type on neon-bg.
  ink:      '#E5E7EB',  // primary text — same as neon.ink
  ink2:     '#9CA3AF',  // muted text — same as neon.ink2
  ink3:     '#6B7280',  // very muted — same as neon.ink3
  // Borders / glass — same alpha as the rest of the app.
  glass:    'rgba(229, 231, 235, 0.08)',
  glassHi:  'rgba(229, 231, 235, 0.16)',
  // Glow shadows for the primary button, mirroring .shadow-neon-violet.
  violetGlow: 'rgba(168, 85, 247, 0.6)',
  // Focus ring — violet at 30% opacity, matches the neon palette.
  violetFocus:     'rgba(168, 85, 247, 0.30)',
  violetFocusHi:   'rgba(168, 85, 247, 0.45)',
  // Non-brand semantic colors — legible on near-black, not in the
  // brand palette.
  danger: '#F87171',  // a touch warmer than paper red for the dark canvas
  success: '#34D399',
} as const;

export const signInAppearance: SignInAppearance = {
  // -----------------------------------------------------------------
  // Options — structural decisions (placement, elevation, etc.)
  // -----------------------------------------------------------------
  options: {
    // No Clerk logo slot; the panel-level wordmark carries brand.
    logoPlacement: 'none',
    // Strip the card chrome so the form sits flush inside our panel.
    elevation: 'flush',
    // Social buttons on top, full-width "Continue with X" style.
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
    // We don't have a terms/privacy/help page to link to yet.
    termsPageUrl: undefined,
    helpPageUrl: undefined,
    privacyPageUrl: undefined,
    // Don't render optional fields (e.g. first/last name) on the
    // sign-in factor-one step.
    showOptionalFields: false,
  },

  // -----------------------------------------------------------------
  // Variables — global tokens applied to Clerk's CSS variables.
  // -----------------------------------------------------------------
  variables: {
    // Brand — primary is the violet so Clerk uses it for focus, links,
    // and the "selected" state. The gradient on the primary button is
    // applied via the elements.formButtonPrimary override below.
    colorPrimary: TOKENS.violet2,
    colorPrimaryForeground: TOKENS.ink,
    // Semantic
    colorDanger: TOKENS.danger,
    colorSuccess: TOKENS.success,
    colorWarning: TOKENS.violet, // future warning state; matches the brand gradient
    // Surfaces
    colorBackground: TOKENS.surface,  // card surface (won't really show — elevation: flush)
    colorInput: TOKENS.black,         // input surface, deeper than card
    // Text
    colorForeground: TOKENS.ink,      // primary text
    colorMutedForeground: TOKENS.ink2, // secondary text (subtitles, hints)
    colorInputForeground: TOKENS.ink,  // text inside inputs
    // Neutrals / borders
    colorNeutral: TOKENS.ink2,
    colorBorder: TOKENS.glass,
    // Focus ring is violet (matches the neon palette).
    colorRing: TOKENS.violet2,
    colorShimmer: TOKENS.glass,
    // Type
    fontFamily: 'var(--font-sans)',
    fontFamilyButtons: 'var(--font-sans)',
    fontFamilyMono: 'var(--font-mono)',
    fontSize: '0.9375rem', // body-m
    // Shape — slightly larger radius than the amber version, to match
    // the pill-heavy feel of the rest of the app.
    borderRadius: '0.5rem',
    // Tighter spacing so the whole form fits one viewport without
    // the card growing taller than the left column.
    spacing: '0.55rem',
  },

  // -----------------------------------------------------------------
  // Elements — fine-grained overrides for primitives that variables
  // don't reach. Kept minimal; only the surfaces that visibly drift
  // from the design system are listed.
  // -----------------------------------------------------------------
  elements: {
    // The SignIn root container — already flush via `elevation`,
    // but be explicit about no background and no padding. Lock to
    // 100% so the form grows with its container instead of pushing
    // the page taller (and triggering a page scroll).
    rootBox: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      height: '100%',
      width: '100%',
    },

    // The internal scroll container Clerk uses. Lock to 100% width
    // and visible overflow so the form renders at the card's natural
    // size — the SignInShell wrapper is sized to fit the card width,
    // and we don't want a second scrollbar (Clerk's) on top of the
    // page scroll.
    scrollBox: {
      maxHeight: 'none',
      overflowY: 'visible',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
    },

    // The Clerk-internal <form> element. Force 100% width so its
    // child inputs/buttons can fill the card — Clerk's default
    // `min-width: auto` lets the form grow past the card edge.
    form: {
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
    },

    // Each field row (label + input + helper text). Force 100% width.
    formFieldRow: {
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
    },

    // The card wraps the form fields. Match the form's natural
    // height with no extra padding (we set the glass card padding
    // in SignInShell instead).
    card: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      padding: '0',
    },

    // Inputs — base style + violet focus ring.
    formFieldInput: {
      backgroundColor: TOKENS.black,
      border: `1px solid ${TOKENS.glass}`,
      borderRadius: '0.5rem',
      color: TOKENS.ink,
      fontFamily: 'var(--font-sans)',
      fontSize: '0.9375rem',
      padding: '0.55rem 0.75rem',
      outline: 'none',
      transition: 'border-color 160ms ease, box-shadow 160ms ease',
      '&:focus': {
        borderColor: TOKENS.violet2,
        boxShadow: `0 0 0 3px ${TOKENS.violetFocus}`,
      },
      '&::placeholder': {
        color: TOKENS.ink3,
      },
    },

    // The password field's show/hide eye button — Clerk renders this
    // inside the input on the right. Give it explicit dimensions so
    // the icon (an SVG) doesn't get clipped by the input row's
    // overflow, and bump the right padding on the input below so the
    // placeholder text doesn't run underneath the icon.
    formFieldInputShowPasswordButton: {
      backgroundColor: 'transparent',
      color: TOKENS.ink2,
      width: '1.75rem',
      height: '1.75rem',
      padding: '0.25rem',
      borderRadius: '0.375rem',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      '&:hover': { color: TOKENS.ink },
    },

    // The input element itself when it's the password variant — add
    // extra right padding so the user's typed text doesn't slide
    // under the eye-icon button.
    formFieldInput__password: {
      paddingRight: '2.5rem',
    },
    // Field labels — match the eyebrow style used across the app
    // (uppercase, 0.12em tracking, muted).
    formFieldLabel: {
      color: TOKENS.ink2,
      fontFamily: 'var(--font-sans)',
      fontSize: '0.75rem',
      fontWeight: '500',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    },

    // Primary action button — the same violet→magenta gradient pill
    // used on the landing CTAs, with a violet glow.
    formButtonPrimary: {
      background:
        `linear-gradient(90deg, ${TOKENS.violet} 0%, ${TOKENS.magenta} 100%)`,
      color: TOKENS.ink,
      fontFamily: 'var(--font-sans)',
      fontSize: '0.9375rem',
      fontWeight: '500',
      borderRadius: '9999px', // pill, matches the rest of the app
      padding: '0.55rem 1.25rem',
      border: 'none',
      cursor: 'pointer',
      textTransform: 'none',
      letterSpacing: '0',
      boxShadow:
        `0 0 0 1px ${TOKENS.violetFocusHi},` +
        `0 10px 30px -10px ${TOKENS.violetGlow},` +
        `0 0 80px -20px ${TOKENS.violetFocusHi}`,
      '&:hover': {
        filter: 'brightness(1.08)',
        transform: 'translateY(-1px)',
      },
      '&:focus': {
        boxShadow:
          `0 0 0 1px ${TOKENS.violetFocusHi},` +
          `0 10px 30px -10px ${TOKENS.violetGlow},` +
          `0 0 0 3px ${TOKENS.violetFocus}`,
      },
      '&:disabled': {
        opacity: '0.6',
        cursor: 'not-allowed',
        transform: 'none',
        filter: 'none',
      },
    },

    // OAuth row — hairline-bordered, transparent background, glass
    // feel so the row reads as part of the same panel as the inputs.
    socialButtonsBlockButton: {
      backgroundColor: 'transparent',
      border: `1px solid ${TOKENS.glass}`,
      borderRadius: '9999px', // pill, matches the rest of the app
      color: TOKENS.ink,
      fontFamily: 'var(--font-sans)',
      fontSize: '0.9375rem',
      fontWeight: '400',
      padding: '0.55rem 1.25rem',
      textTransform: 'none',
      letterSpacing: '0',
      '&:hover': {
        backgroundColor: 'rgba(229, 231, 235, 0.04)',
        borderColor: TOKENS.glassHi,
      },
    },
    socialButtonsBlockButtonText: {
      color: TOKENS.ink,
      fontWeight: '400',
    },

    // "Last used" badge that Clerk places on the most recent OAuth
    // provider. It's a small meta-pill, but it sits on the right
    // edge of the button — outside the button's text padding — and
    // gets clipped by the parent `overflow-hidden` card. We hide it
    // here so the form reads as a single, clean column.
    lastAuthenticationStrategyBadge: {
      display: 'none',
    },

    // Divider between social and email sections.
    dividerLine: {
      backgroundColor: TOKENS.glass,
    },
    dividerText: {
      color: TOKENS.ink3,
      fontFamily: 'var(--font-sans)',
      textTransform: 'uppercase',
      fontSize: '0.75rem',
      letterSpacing: '0.12em',
    },

    // Identity preview pill on second-factor ("Continue as <name>").
    identityPreview: {
      backgroundColor: 'rgba(229, 231, 235, 0.04)',
      border: `1px solid ${TOKENS.glass}`,
      borderRadius: '0.5rem',
    },
    identityPreviewText: {
      color: TOKENS.ink,
    },
    identityPreviewEditButton: {
      color: TOKENS.ink2,
      '&:hover': { color: TOKENS.ink },
    },

    // OTP / code inputs.
    otpCodeFieldInput: {
      backgroundColor: TOKENS.black,
      border: `1px solid ${TOKENS.glass}`,
      color: TOKENS.ink,
      borderRadius: '0.5rem',
      fontFamily: 'var(--font-sans)',
      '&:focus': {
        borderColor: TOKENS.violet2,
        boxShadow: `0 0 0 3px ${TOKENS.violetFocus}`,
      },
    },

    // Status / error messaging — softened violet tint instead of
    // the amber used on the legacy page.
    alert: {
      backgroundColor: 'rgba(168, 85, 247, 0.12)',
      border: '1px solid rgba(168, 85, 247, 0.3)',
      borderRadius: '0.5rem',
      color: TOKENS.ink,
      fontSize: '0.8125rem',
    },
    alertText: { color: TOKENS.ink },
    formFieldErrorText: { color: TOKENS.danger, fontSize: '0.8125rem' },
    formFieldHintText: { color: TOKENS.ink2, fontSize: '0.8125rem' },

    // Loading spinner — violet so it matches the brand gradient.
    spinner: { color: TOKENS.violet2 },

    // Footer action row ("Don't have an account? Sign up" / etc.) —
    // bump the action link's tap target to >= 24x24 so it meets
    // WCAG 2.5.5 on mobile. The text itself stays body-m.
    footerAction: {
      padding: '0.25rem 0',
      minHeight: '1.75rem',
    },
    footerActionLink: {
      color: TOKENS.violet2,
      minHeight: '1.75rem',
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.25rem 0.5rem',
      borderRadius: '0.375rem',
      '&:hover': { color: TOKENS.ink },
    },
    footerActionText: {
      color: TOKENS.ink2,
    },
  },
};
