// The service worker (public/sw.js) is copied into the build as it is and cannot read Vite's env, so the one
// project address it needs (push delivery receipts) is written into dist/sw.js here from VITE_SUPABASE_URL.
// public/sw.js keeps the current project as its literal, which is what the dev server serves.
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

const LITERAL = 'https://heuhqqoxyggawuckxocp.supabase.co'

export default function swEnv() {
  let outDir = 'dist'
  let url = ''
  return {
    name: 'tryp-sw-env',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      url = (loadEnv(config.mode, config.root, 'VITE_').VITE_SUPABASE_URL || '').replace(/\/+$/, '')
    },
    closeBundle() {
      const file = path.join(outDir, 'sw.js')
      if (!url || !fs.existsSync(file)) return
      const src = fs.readFileSync(file, 'utf8')
      if (!src.includes(LITERAL)) throw new Error('sw.js no longer contains the project address this plugin replaces')
      fs.writeFileSync(file, src.split(LITERAL).join(url))
    },
  }
}
