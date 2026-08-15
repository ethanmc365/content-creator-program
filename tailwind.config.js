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
        // A MENU UNFOLDING FROM THE THING THAT OPENED IT.
        //
        // Menus anchored to the top (the avatar dropdown, the notification
        // panel) grow out of their own origin corner like a native menu rather
        // than rising from below.
        //
        // WHAT CHANGED, AND WHY IT NEEDED TO. It was a 160ms linear-ish fade
        // from `scale(0.95)`, which at that duration is not a movement anybody
        // perceives - the menu simply appeared, slightly blurred on the way.
        // Ethan asked for the profile dropdown and the notification bell to
        // open better, and there is nothing to improve about a transition too
        // short to see. This one starts from a genuinely smaller, slightly
        // raised box, overshoots by a whisker on the way out and settles, on a
        // spring-ish curve over 220ms - the same easing the toast and the map
        // overlay already use, so all three read as one product.
        //
        // 220ms is the ceiling for a control that opens under a cursor that is
        // already moving towards what it wants to press. The origin corner is
        // set per menu (`origin-top-right`), which is what makes it unfold from
        // the avatar rather than from the middle of itself.
        'menu-in': {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(-8px)' },
          '55%': { opacity: '1' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
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
        // A FLAME THAT ACTUALLY BURNS, IN THREE LAYERS.
        //
        // `flicker` above moved the WHOLE flame as one rigid shape, which is
        // what a candle in a draught does, not what a fire does. Ethan: "for the
        // streak icon, can you make it a constant animation that's like an
        // actual fiery, flowy, flamy flame."
        //
        // A real flame reads as flowing for one reason: its parts move at
        // DIFFERENT SPEEDS. The outer body is heavy and sways slowly, the inner
        // tongue licks up through it about half again as fast, and the white
        // core at the base jitters faster than either. Three layers on three
        // periods that do not divide into each other never repeat visibly, so a
        // two-second loop reads as an endless one - and it is three CSS
        // animations on three composited paths rather than anything per-frame.
        //
        // Every one of them is anchored at the BASE (`transform-origin: 50% 92%`
        // is set on the elements). A flame pinned at its middle grows downwards
        // as well as up, which reads as a balloon inflating.
        'flame-body': {
          '0%, 100%': { transform: 'scaleY(1) scaleX(1) rotate(0deg)' },
          '22%': { transform: 'scaleY(1.09) scaleX(0.94) rotate(-2.5deg)' },
          '48%': { transform: 'scaleY(0.95) scaleX(1.05) rotate(1.8deg)' },
          '74%': { transform: 'scaleY(1.06) scaleX(0.97) rotate(-1deg)' },
        },
        'flame-inner': {
          '0%, 100%': { transform: 'scaleY(0.96) scaleX(1.03) rotate(1.5deg)', opacity: '0.85' },
          '30%': { transform: 'scaleY(1.12) scaleX(0.9) rotate(-2deg)', opacity: '1' },
          '65%': { transform: 'scaleY(0.92) scaleX(1.06) rotate(2.5deg)', opacity: '0.8' },
        },
        'flame-core': {
          '0%, 100%': { transform: 'scaleY(1) scaleX(1)', opacity: '0.95' },
          '40%': { transform: 'scaleY(1.18) scaleX(0.86)', opacity: '0.7' },
          '70%': { transform: 'scaleY(0.9) scaleX(1.1)', opacity: '1' },
        },
        // One spark leaving the top and going out. Two of them on offset delays
        // is the difference between a drawing of a fire and a fire.
        'flame-spark': {
          '0%': { opacity: '0', transform: 'translateY(2px) scale(0.5)' },
          '18%': { opacity: '0.95' },
          '100%': { opacity: '0', transform: 'translateY(-9px) scale(0.15)' },
        },
        // A STREAK THAT IS ALIGHT, AND ONE THAT IS ONLY WARM.
        //
        // `flicker` above is the movement of the flame itself. These two are
        // the HALO behind it, and they are what makes the state readable from
        // across the card: a counted day pulses brightly and quickly, a day
        // still to be earned glows slowly and faintly. Same shape, different
        // temperature - which is exactly the distinction the card is making.
        'flame-glow': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.18)', opacity: '0.9' },
        },
        // Embers. Slower and much shallower: this must read as waiting, not as
        // something trying to get your attention.
        ember: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '0.72', transform: 'scale(1.03)' },
        },
        // FULL SCREEN ARRIVING AND LEAVING.
        //
        // A map that goes full screen by simply EXISTING at inset-0 is a hard
        // cut: one frame it is a card in the page, the next it is the whole
        // window. Ethan: "when entering and exiting the full screen map there
        // should be clean animation, not just flashy appear."
        //
        // It grows from slightly under full size while fading in, which reads
        // as the card expanding into the window rather than as a new screen
        // being pasted over the old one. The exit is the same movement
        // backwards, and it is why the overlay stays mounted for 180ms after
        // you press the button - see `closing` in the components.
        'map-in': {
          from: { opacity: '0', transform: 'scale(0.965)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'map-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.965)' },
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
        'menu-in': 'menu-in 220ms cubic-bezier(0.22, 1.12, 0.36, 1) both',
        confetti: 'confetti 3s linear forwards',
        shake: 'shake 0.4s ease-in-out both',
        flicker: 'flicker 2.6s ease-in-out infinite',
        // Three periods that do not divide into one another, so the loop never
        // visibly repeats. See the keyframes.
        'flame-body': 'flame-body 1.9s ease-in-out infinite',
        'flame-inner': 'flame-inner 1.25s ease-in-out infinite',
        'flame-core': 'flame-core 0.8s ease-in-out infinite',
        'flame-spark': 'flame-spark 2.1s ease-out infinite',
        'map-in': 'map-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'map-out': 'map-out 180ms cubic-bezier(0.4, 0, 1, 1) both',
        'flame-glow': 'flame-glow 2.6s ease-in-out infinite',
        ember: 'ember 4.2s ease-in-out infinite',
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
