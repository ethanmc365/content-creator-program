// Shared by the maintenance scripts: the project URL comes from `.env`
// (VITE_SUPABASE_URL, the same value the app is built with) and the service key
// from the gitignored `.env.qa` (SUPABASE_SERVICE_KEY). Real environment
// variables win over both files, so CI or another machine can pass them in.
import { existsSync, readFileSync } from 'node:fs'

function readEnvFile(name) {
  const url = new URL(`../${name}`, import.meta.url)
  if (!existsSync(url)) return {}
  const out = {}
  for (const line of readFileSync(url, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

const files = { ...readEnvFile('.env'), ...readEnvFile('.env.qa') }
const env = (k) => process.env[k] || files[k] || ''

export const SUPABASE_URL = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '')
export const SERVICE_KEY = env('SUPABASE_SERVICE_KEY')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set VITE_SUPABASE_URL (in .env) and SUPABASE_SERVICE_KEY (in .env.qa) first.')
  process.exit(1)
}
