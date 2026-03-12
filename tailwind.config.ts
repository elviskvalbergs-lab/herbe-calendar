import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:        '#231f20',
        surface:   '#2d2829',
        border:    '#3a3435',
        primary:   '#cd4c38',
        'person-1': '#00ABCE',
        'person-2': '#cd4c38',
        'person-3': '#4db89a',
        'text-muted': '#6b6467',
      },
    },
  },
}
export default config
