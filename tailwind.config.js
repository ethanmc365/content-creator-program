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
        // THE ANSWER FLASH. A green or red wash over the whole question card
        // the instant an answer lands - it reads faster than any word can, and
        // unlike the sound it works with the volume down. It fades back to
        // nothing rather than holding, so the card is neutral again before the
        // next question arrives and two answers never blur together.
        'flash-right': {
          '0%': { backgroundColor: 'rgba(22, 163, 74, 0)' },
          '18%': { backgroundColor: 'rgba(22, 163, 74, 0.18)' },
          '100%': { backgroundColor: 'rgba(22, 163, 74, 0)' },
        },
        'flash-wrong': {
          '0%': { backgroundColor: 'rgba(220, 38, 38, 0)' },
          '18%': { backgroundColor: 'rgba(220, 38, 38, 0.18)' },
          '100%': { backgroundColor: 'rgba(220, 38, 38, 0)' },
        },
        // A streak flame that is actually alight. Tiny - a big wobble on a
        // number somebody is proud of reads as unstable, not as fire.
        flicker: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
          '35%': { transform: 'scale(1.06) rotate(-2deg)', opacity: '0.92' },
          '70%': { transform: 'scale(0.97) rotate(1.5deg)', opacity: '1' },
        },
        // Wrong guess / blocked move: a quick horizontal shake.
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        // An aeroplane flying straight across the dashed line. Horizontal only -
        // no vertical bob - so its centre stays exactly on the line.
        fly: {
          '0%': { transform: 'translateX(-130%)', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateX(210%)', opacity: '0' },
        },
        // A plane PARKED on a card rather than crossing it: a slow, small drift
        // so the card has a pulse without anything ever entering or leaving.
        // Both ends are identical so the loop has no seam.
        //
        // Rotation stays under a degree and is POSITIVE at the top of the bob.
        // The artwork faces left, so a positive (clockwise) rotation lifts the
        // nose; the previous keyframe rotated to -4deg and pitched it into a
        // permanent dive. The static pitch correction lives on the image itself
        // (TrypPlane's PITCH_FIX) so this only has to add the motion.
        cruise: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '50%': { transform: 'translate3d(-6px, -7px, 0) rotate(0.8deg)' },
        },
        // A toast arriving: up from below with a touch of overshoot, which is
        // what makes it read as a physical thing landing rather than a div
        // appearing. Kept in CSS so the toast host never imports the animation
        // runtime (see the note in ToastHost).
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(18px) scale(0.94)' },
          '65%': { transform: 'translateY(-3px) scale(1.01)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // The dashed contrail behind it, drawn as an SVG path. Marching the
        // dash offset reads as travel; animating the path itself would not.
        // NEGATIVE, deliberately. The sign depends entirely on which end of the
        // path is drawn first, and that changed: the trail used to run from the
        // far corner INTO the tail and now runs from the tail OUT to the edge.
        // A dash offset shifts the pattern back toward the path's start, so
        // with the tail as the start it has to be negative or the dashes crawl
        // forwards into the fuselage.
        contrail: {
          to: { strokeDashoffset: '-24' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pop-in': 'pop-in 0.35s ease-out both',
        'page-in': 'page-in 0.35s ease-out both',
        'menu-in': 'menu-in 0.16s ease-out both',
        confetti: 'confetti 3s linear forwards',
        shake: 'shake 0.4s ease-in-out both',
        flicker: 'flicker 2.6s ease-in-out infinite',
        'flash-right': 'flash-right 0.9s ease-out both',
        'flash-wrong': 'flash-wrong 0.9s ease-out both',
        fly: 'fly 1.7s ease-in-out infinite',
        'toast-in': 'toast-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        cruise: 'cruise 7s ease-in-out infinite',
        contrail: 'contrail 1.4s linear infinite',
      },
    },
  },
  plugins: [],
}
