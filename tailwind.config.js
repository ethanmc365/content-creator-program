/** @type {import('tailwindcss').Config} */
// Tryp.com Creator Program design system.
// White-dominant, spacious layouts with burnt orange used only as an accent.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — see README "Branding" section.
        brand: {
          DEFAULT: '#d94407', // primary burnt orange: buttons, active states, map fills
          light: '#f5853f',   // hover states, secondary accents, badges
          tint: '#fdf0e7',    // very light orange wash for subtle highlights
        },
        ink: '#1A1A1A',       // primary text (charcoal)
        smoke: '#6B7280',     // secondary text (mid-grey)
        cloud: '#F7F7F8',     // gentle section/card separation only
      },
      fontFamily: {
        // Poppins everywhere — loaded in index.css from Google Fonts.
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem', // soft rounded corners on every card
      },
      boxShadow: {
        // Very subtle elevation — light, never heavy.
        card: '0 1px 3px rgba(26, 26, 26, 0.05), 0 4px 16px rgba(26, 26, 26, 0.04)',
        lift: '0 4px 12px rgba(26, 26, 26, 0.08), 0 12px 32px rgba(26, 26, 26, 0.06)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '60%': { transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        confetti: {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: '0' },
        },
        // A firework particle shooting outward from its burst origin and fading.
        // --dx / --dy set per-particle to radiate in a circle.
        burst: {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '80%': { opacity: '1' },
          '100%': { transform: 'translate(var(--dx, 0), var(--dy, 0)) scale(0.3)', opacity: '0' },
        },
        // Gentle opacity-only entrance for page content. Deliberately has NO
        // transform: a persisted transform on `.page` would become a containing
        // block for position:fixed children (the mobile chat overlay).
        'page-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        // Menus anchored to the top (avatar dropdown) scale in from their
        // origin like native menus, instead of rising from below.
        'menu-in': {
          from: { opacity: '0', transform: 'scale(0.95) translateY(-4px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // Wrong guess / blocked move: a quick horizontal shake.
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        // An aeroplane flying across, used by the airplane loader.
        fly: {
          '0%': { transform: 'translateX(-130%) translateY(2px)', opacity: '0' },
          '15%': { opacity: '1' },
          '50%': { transform: 'translateX(40%) translateY(-2px)' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateX(210%) translateY(2px)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pop-in': 'pop-in 0.35s ease-out both',
        'page-in': 'page-in 0.35s ease-out both',
        'menu-in': 'menu-in 0.16s ease-out both',
        confetti: 'confetti 3s linear forwards',
        shake: 'shake 0.4s ease-in-out both',
        burst: 'burst 1.3s ease-out infinite',
        fly: 'fly 1.7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
