/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/*
 * All colours, radii, shadows and fonts come from src/theme/tokens.css,
 * the single source of truth for the UR Free Here look (light and dark).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: c('bg'),
        ink: { DEFAULT: c('ink'), soft: c('ink-soft') },
        muted: c('muted'),
        line: { DEFAULT: c('line'), strong: c('line-strong') },
        surface: c('surface'),
        canvas: c('canvas'),
        subtle: c('subtle'),
        rail: { DEFAULT: c('rail'), fg: c('rail-fg') },
        accent: { DEFAULT: c('accent'), hover: c('accent-hover'), soft: c('accent-soft') },
        'bubble-own': c('bubble-own'),
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        inverse: c('inverse'),
        'on-inverse': c('on-inverse'),
        mic: c('mic'),
      },
      // Text needs lighter tints of the brand/status colours in dark mode.
      textColor: {
        accent: { DEFAULT: c('accent-text'), hover: c('accent-text') },
        success: c('success-text'),
        danger: c('danger-text'),
        warning: c('warning-text'),
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
