import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0a',
          1: '#111111',
          2: '#1a1a1a',
          3: '#222222',
        },
        accent: {
          DEFAULT: '#3b82f6',
          dim: '#1e3a5f',
        },
        ok: '#22c55e',
        warn: '#eab308',
        err: '#ef4444',
      },
    },
  },
  plugins: [],
}
export default config
