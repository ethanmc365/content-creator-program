/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import devAuth from './vite-dev-auth'

// https://vite.dev/config/
export default defineConfig({
  // devAuth is `apply: 'serve'`, so it exists on the dev server and cannot be
  // part of a production build. It serves /__dev-login, which mints a QA
  // session with the Supabase admin API so signed-in testing never has to get
  // past a captcha. See vite-dev-auth.js for the guards on it.
  plugins: [react(), devAuth()],
  // Use the automatic JSX runtime everywhere (incl. the vitest transform), so
  // source/test files that use JSX don't need to import React explicitly.
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest, rarely-changing libraries into their own vendor
        // chunks so they cache independently and don't bloat the app bundle.
        // (Admin pages are also route-split via React.lazy in App.jsx, which
        // keeps recharts out of the initial load entirely.) Shared d3 modules
        // are left unassigned so rolldown can hoist them into a shared chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts')) return 'charts'
          if (id.includes('react-simple-maps') || id.includes('topojson-client')) return 'maps'
          if (id.includes('@supabase')) return 'supabase'
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
