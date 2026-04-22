import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        rhyze: {
          black: '#0A0A0A',
          charcoal: '#1A1A1A',
          coral: '#F05A3C',
          orange: '#F7931E',
          gold: '#FFC72C',
          cream: '#F5F1E8',
          white: '#FFFFFF',
        },
        level: {
          foundation: '#10B981',
          signature: '#FFC72C',
          peak: '#F05A3C',
        },
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'Impact', 'sans-serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'rhyze-gradient':
          'linear-gradient(90deg, #F05A3C 0%, #F7931E 50%, #FFC72C 100%)',
        'rhyze-gradient-radial':
          'radial-gradient(circle at 30% 20%, rgba(240,90,60,0.25) 0%, rgba(247,147,30,0.10) 35%, transparent 70%)',
      },
      boxShadow: {
        glow: '0 0 40px rgba(240, 90, 60, 0.35)',
        'glow-gold': '0 0 40px rgba(255, 199, 44, 0.28)',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        shimmer: 'shimmer 8s linear infinite',
        'beam-drift': 'beamDrift 14s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        beamDrift: {
          '0%': { transform: 'translate3d(-5%, -5%, 0) rotate(0deg)' },
          '100%': { transform: 'translate3d(5%, 5%, 0) rotate(8deg)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
