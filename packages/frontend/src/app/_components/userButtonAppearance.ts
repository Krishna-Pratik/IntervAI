/** Clerk <UserButton /> re-skinned to the neon design system (tokens mirror
 *  tailwind.config.js `neon.*`). TOKENS is duplicated per Clerk appearance
 *  file on purpose — allows per-component divergence without cross-file imports. */

import type { UserButton } from '@clerk/nextjs';

/** Derived from the component so this stays in sync if Clerk renames or narrows the type. */
type UserButtonAppearance = NonNullable<
  Parameters<typeof UserButton>[0]['appearance']
>;

const TOKENS = {
  surface:  '#0F0F1A',  // card surface — same as neon.surface
  black:    '#0A0A12',  // deeper surface
  violet:   '#7C3AED',
  violet2:  '#A855F7',
  ink:      '#E5E7EB',  // primary text
  ink2:     '#9CA3AF',  // muted text
  glass:    'rgba(229, 231, 235, 0.08)',
  glassHi:  'rgba(229, 231, 235, 0.16)',
  violetFocus: 'rgba(168, 85, 247, 0.30)',
  danger: '#F87171',
} as const;

export const userButtonAppearance: UserButtonAppearance = {
  variables: {
    // Violet drives Clerk's focus/hover/selected states.
    colorPrimary: TOKENS.violet2,
    colorPrimaryForeground: TOKENS.ink,
    colorBackground: TOKENS.surface,
    colorInput: TOKENS.black,
    colorForeground: TOKENS.ink,
    colorMutedForeground: TOKENS.ink2,
    colorNeutral: TOKENS.ink2,
    colorBorder: TOKENS.glass,
    colorRing: TOKENS.violet2,
    colorDanger: TOKENS.danger,
    borderRadius: '0.5rem',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.875rem',
  },
  elements: {
    // The popover root — same surface as the rest of the app,
    // with a hairline border and the soft shadow the design uses
    // for elevated surfaces.
    userButtonPopoverCard: {
      backgroundColor: TOKENS.surface,
      border: `1px solid ${TOKENS.glass}`,
      boxShadow:
        '0 0 0 1px rgba(229, 231, 235, 0.06),' +
        '0 20px 60px -20px rgba(0, 0, 0, 0.6),' +
        '0 0 40px -20px rgba(124, 58, 237, 0.3)',
    },
    // Each menu item in the popover — transparent until hover.
    userButtonPopoverActionButton: {
      color: TOKENS.ink,
      '&:hover': {
        backgroundColor: 'rgba(229, 231, 235, 0.04)',
      },
    },
    // The destructive action (sign out) uses the danger color.
    userButtonPopoverActionButton__signOut: {
      color: TOKENS.danger,
    },
    // The user preview row at the top of the popover.
    userButtonPopoverMain: {
      backgroundColor: 'transparent',
    },
  },
};
