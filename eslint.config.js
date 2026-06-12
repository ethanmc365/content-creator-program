import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The classic, important hook rules stay ON (rules-of-hooks, exhaustive-deps).
      // The rules below are new EXPERIMENTAL React-compiler checks that flag the
      // standard "fetch data in useEffect → setState" pattern this app uses
      // deliberately for readability. Safe to re-enable if the app ever adopts
      // the React Compiler.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      // Mixed component/helper exports (e.g. <PlatformBadges> + platformsForProfile)
      // only affect hot-reload granularity in dev, not production behaviour.
      'react-refresh/only-export-components': 'off',
    },
  },
])
