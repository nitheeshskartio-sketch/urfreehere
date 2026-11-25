/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/*
 * All colours, radii, shadows and fonts come from src/theme/tokens.css,
 * the single source of truth for the UR Free Here look.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: c('ink'), soft: c('ink-soft') },
        muted: c('muted'),
        line: { DEFAULT: c('line'), strong: c('line-strong') },
        surface: c('surface'),
        accent: { DEFAULT: c('accent'), hover: c('accent-hover'), soft: c('accent-soft') },
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        mic: c('mic'),
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-md)',
        xl: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
      spacing: {
        header: 'var(--header-h)',
      },
    },
  },
  plugins: [],
};
