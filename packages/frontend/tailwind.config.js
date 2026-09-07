/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // App palette. Near-black surfaces with violet/cyan/magenta
        // accents; muted text comes in three steps so a card-on-body
        // reads as a card, not a smudge.
        neon: {
          // Base — near-black with a violet undertone, like the reference.
          black:    '#0A0A12',
          surface:  '#0F0F1A',
          // Glow colours
          violet:   '#7C3AED',
          violet2:  '#A855F7',
          cyan:     '#06B6D4',
          magenta:  '#EC4899',
          // Text on neon-bg
          ink:      '#E5E7EB',  // primary text
          ink2:     '#9CA3AF',  // muted text
          ink3:     '#6B7280',  // very muted
          // Borders / glass
          glass:    'rgba(229, 231, 235, 0.08)',
          glassHi:  'rgba(229, 231, 235, 0.16)',
        },
      },

      fontFamily: {
        // next/font puts the actual font name behind a CSS variable.
        // Reference the variable so Tailwind's font-sans / font-display
        // utilities pick up the loaded font instead of falling back to
        // the system default.
        sans: 'var(--font-sans)',
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
      },

      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '500' }],
        'display-l': ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '500' }],
        'display-m': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '500' }],
        'display-s': ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '500' }],
        'body-l': ['1.0625rem', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
        'body-m': ['0.9375rem', { lineHeight: '1.55', letterSpacing: '0', fontWeight: '400' }],
        'label': ['0.75rem', { lineHeight: '1.3', letterSpacing: '0.08em', fontWeight: '500' }],
        'mono': ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '400' }],

        // Hero / stat / numeral scale — used by the marketing landing
        // page and the bigger dashboard headlines. Kept separate from
        // the `display-*` scale so tweaking one doesn't ripple.
        'hero-xl':    ['5.5rem',  { lineHeight: '0.95', letterSpacing: '-0.04em', fontWeight: '500' }],
        'hero-l':     ['3.75rem', { lineHeight: '1.0',  letterSpacing: '-0.03em', fontWeight: '500' }],
        'stat':       ['5rem',    { lineHeight: '1.0',  letterSpacing: '-0.04em', fontWeight: '600' }],
        'numeral':    ['8rem',    { lineHeight: '0.9',  letterSpacing: '-0.05em', fontWeight: '500' }],
        'eyebrow':    ['0.8125rem', { lineHeight: '1.3', letterSpacing: '0.12em', fontWeight: '500' }],
      },

      // Custom keyframes for the one orchestrated motion in the design.
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'scaleY(0.35)', opacity: '0.55' },
          '25%': { transform: 'scaleY(0.95)', opacity: '1' },
          '50%': { transform: 'scaleY(0.5)', opacity: '0.7' },
          '75%': { transform: 'scaleY(1)', opacity: '1' },
        },

        // Slow, ambient, never distracting.
        'aurora-spin': {
          '0%':   { transform: 'translate3d(-10%, -10%, 0) rotate(0deg)' },
          '50%':  { transform: 'translate3d(8%, 4%, 0) rotate(180deg)' },
          '100%': { transform: 'translate3d(-10%, -10%, 0) rotate(360deg)' },
        },
        'orb-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '33%':      { transform: 'translate3d(30px, -20px, 0) scale(1.08)' },
          '66%':      { transform: 'translate3d(-20px, 15px, 0) scale(0.95)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(0.85)' },
        },
        'gradient-shift': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%':      { 'background-position': '100% 50%' },
        },
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        wave: 'wave 2s ease-in-out infinite',
        'aurora-spin':  'aurora-spin 28s linear infinite',
        'orb-drift':    'orb-drift 14s ease-in-out infinite',
        'pulse-dot':    'pulse-dot 2.4s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'float-y':      'float-y 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
