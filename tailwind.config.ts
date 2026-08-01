import type { Config } from 'tailwindcss'

export default {
  content: ['./src/{app,components}/**/*.{js,jsx,ts,tsx}'],

  // dark:* 变体跟随 App 主题（html[theme="darkDefault"]），而非 OS prefers-color-scheme
  darkMode: ['selector', '[theme="darkDefault"]'],

  theme: {
    extend: {
      colors: {},

      padding: {
        layoutHeader: 'var(--layout-header-height)',
        main: 'var(--p-main)',
        tabContent: 'var(--p-tab-content)',
      },

      margin: {
        tabContent: 'var(--p-tab-content)',
      },
    },
  },

  corePlugins: {
    preflight: false,
  },
} satisfies Config
