/**
 * PostCSS config — wires Tailwind + Autoprefixer into Next.js's CSS pipeline.
 *
 * Without this file, Next.js doesn't know to run Tailwind on
 * globals.css, and `@tailwind base;` ships to the browser as a
 * literal unknown at-rule. Tailwind config is in ./tailwind.config.js.
 */

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
