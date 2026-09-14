/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import devAuth from './vite-dev-auth'
import bootCss from './vite-boot-css'

// https://vite.dev/config/
export default defineConfig({
  // devAuth is `apply: 'serve'`, so it exists on the dev server and cannot be
  // part of a production build. It serves /__dev-login, which mints a QA
  // session with the Supabase admin API so signed-in testing never has to get
  // past a captcha. See vite-dev-auth.js for the guards on it.
  plugins: [react(), devAuth(), bootCss()],
  // Use the automatic JSX runtime everywhere (incl. the vitest transform), so
  // source/test files that use JSX don't need to import React explicitly.
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: {
      output: {
        // WHY THIS IS `advancedChunks` AND NOT `manualChunks` (14 Sep 2026).
        //
        // Ethan: "I also noticed some issues with the pages loading, taking
        // much longer than usual."
        //
        // He is right, and the cause was here. This block used to be a
        // `manualChunks(id)` function whose comment claimed it "keeps recharts
        // out of the initial load entirely". That had stopped being true, and
        // nothing said so.
        //
        // WHAT WAS ACTUALLY HAPPENING. The project is on Vite 8, which builds
        // with rolldown, and rolldown places SHARED modules by its own
        // algorithm: a module reachable from several chunks is hoisted into one
        // of them. `react-dom` is imported by recharts and by the app, and it
        // landed in the recharts chunk. From that moment `charts` was a
        // dependency of the ENTRY rather than of the admin routes, so
        // index.html carried a `<link rel="modulepreload">` for it and every
        // creator downloaded 554kB (162kB gzipped) of charting library before
        // any page could paint. Verified against the live deployment on 14 Sep:
        // `trypcreators.vercel.app` was preloading `charts-Dhp-UdkO.js`, and
        // that chunk contained `createRoot`, `hydrateRoot`, `createPortal`,
        // `flushSync` and 93 references to the fiber tree's `.sibling`.
        //
        // AND `manualChunks` COULD NOT FIX IT. Naming react-dom in the old
        // function changed nothing at all - the charts chunk kept the same
        // content hash across every variation of it - because under rolldown
        // `manualChunks` is a compatibility shim that assigns modules and does
        // NOT override the shared-module hoisting that was causing this.
        // `advancedChunks.groups` is the API that does, and `priority` is the
        // part that matters: react's group outranks the recharts group, so
        // react-dom is claimed before recharts can absorb it.
        //
        // THE RULE, because this will be tempting to "tidy" later: a vendor
        // split that names a LEAF library and not that library's SHARED
        // dependencies is not a split. It is an invitation for the shared
        // dependency to be dragged in front of every user by whichever leaf
        // happens to win. React and react-dom are the shared dependency of
        // everything here, so they are named first and ranked highest.
        //
        // `src/bundleGraph.test.js` fails if charts ever rejoins the entry.
        advancedChunks: {
          groups: [
            // Highest priority: the runtime every page needs on its first
            // frame. This must be claimed before any leaf library can absorb it.
            { name: 'react', test: /node_modules[/\\](react|react-dom|scheduler)[/\\]/, priority: 100 },
            // The heavy, rarely-changing leaves, route-split via React.lazy in
            // App.jsx and cached independently of the app bundle.
            // AND d3 IS SHARED BETWEEN THE TWO LEAVES, so it needs its own
            // home for exactly the same reason react-dom did. recharts and
            // react-simple-maps both sit on d3-scale/-shape/-array/-geo; with
            // no group of its own that shared code was hoisted into `charts`,
            // and because the creator map is on the eagerly-routed profile
            // page, `maps` then dragged `charts` back into the entry graph -
            // the same bug as react-dom, one layer down and by a different
            // route. Ranked above both leaves so neither can claim it.
            { name: 'd3', test: /node_modules[/\\](d3-[a-z]+|internmap|delaunator|robust-predicates)[/\\]/, priority: 80 },
            { name: 'charts', test: /node_modules[/\\]recharts[/\\]/, priority: 50 },
            { name: 'maps', test: /node_modules[/\\](react-simple-maps|topojson-client)[/\\]/, priority: 50 },
            { name: 'supabase', test: /node_modules[/\\]@supabase[/\\]/, priority: 50 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
})
