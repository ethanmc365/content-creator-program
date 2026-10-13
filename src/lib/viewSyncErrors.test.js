import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { SYNC_ERRORS, describeSyncError } from './viewSync'

// Every error code the view reader can store must be explained on the results page: what happened and what to do.
// The codes are read from the edge function's own source, so a new one fails this test until it is described.
const dir = join(process.cwd(), 'supabase/functions/view-sync')
const src = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('test')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
const emitted = [...new Set([...src.matchAll(/fail\([^;]*?,\s*'([a-z_]+)'/g)].map((m) => m[1]))]

describe('view sync error codes', () => {
  it('finds the codes in the edge function', () => {
    expect(emitted.length).toBeGreaterThan(8)
  })
  it('explains every one with a label, a reason and an action', () => {
    for (const code of emitted) {
      const e = SYNC_ERRORS[code]
      expect(e, code).toBeTruthy()
      expect(e.label && e.hint && e.action, code).toBeTruthy()
    }
  })
  it('still says something useful about a code it has never seen', () => {
    const d = describeSyncError('brand_new_code')
    expect(d.hint).toMatch(/brand_new_code/)
    expect(d.action).toBeTruthy()
  })
})
