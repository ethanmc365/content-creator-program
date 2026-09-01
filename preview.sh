#!/bin/bash
# Serve the PRODUCTION build, which is the only place the boot splash can be
# checked: `vite-boot-css.js` is `apply: 'build'`, so the dev server does not
# have the non-blocking stylesheet at all.
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"
exec npm run preview -- --port "${PORT:-4173}" --strictPort
