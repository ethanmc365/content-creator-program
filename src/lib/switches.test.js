import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// THERE IS ONE ON/OFF SWITCH, AND IT IS `Toggle` IN components/ui.
//
// A hand-rolled switch has broken the same way twice: its white knob had `absolute` but no `left`, so inside a
// <button> it started wherever the button centred its content and the "on" translate slid it off the end of the track.
// 15 Oct 2026 it was fixed in `Toggle` and the comment there says every copy drifted; 20 Oct 2026 Ethan found the Video
// of the Week switch on the challenge form broken in exactly that way ("this has been a recurring issue... ensure that
// this doesn't happen again"), because that card had its own copy.
//
// So: `role="switch"` may only appear in the files below. Anything else uses <Toggle on onChange label />.
const ALLOWED = new Set([
  'components/ui/index.jsx', // Toggle itself
  'pages/GlobalSettings.jsx', // BigToggle: a whole card is the switch; its knob is pinned with left-0
])

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('switches', () => {
  it('every on/off switch is the shared Toggle', () => {
    const offenders = walk(SRC)
      .filter((p) => /role=["']switch["']/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p))
      .filter((p) => !ALLOWED.has(p))
    expect(offenders).toEqual([])
  })
  it('the shared Toggle pins its knob with left and top', () => {
    const ui = readFileSync(join(SRC, 'components/ui/index.jsx'), 'utf8')
    const body = ui.slice(ui.indexOf('export function Toggle('), ui.indexOf('export function CopyButton('))
    expect(body).toMatch(/absolute left-0\.5 top-0\.5/)
  })
})
