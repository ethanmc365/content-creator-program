import { useEffect, useState } from 'react'
import { profilesApi } from '../api/profiles'

// WHO A NOTIFICATION IS ABOUT, WITH THEIR PHOTO (22 Oct 2026).
//
// A notification row has no sender column: the person is named in the text ("Bruna mentioned you in General", "Ethan sent
// you a message.") or is the profile in the link (/profile/<id>). The bell showed their initials only. This finds the
// profile and its photo. Names are matched exactly and only used when ONE profile has that name, so two people called
// "Maria Lopez" fall back to initials rather than showing the wrong face.
const UUID = /\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/** The leading 1-3 words of a sentence, longest first: "Fatelin Jimenez reacted" -> that, "Fatelin Jimenez", "Fatelin". */
export function namePrefixes(text = '') {
  const words = String(text).trim().split(/\s+/).filter(Boolean).slice(0, 3)
  const out = []
  for (let i = words.length; i >= 1; i -= 1) out.push(words.slice(0, i).join(' '))
  return out
}

/** What to look the person up by: a profile id from the link, or candidate names from the title (and a DM's body). */
export function actorKeys(n) {
  const id = String(n?.link || '').match(UUID)?.[1]
  if (id) return { id, names: [] }
  const names = namePrefixes(n?.title)
  if (n?.type === 'dm') names.push(...namePrefixes(n?.body))
  return { id: null, names }
}

const byName = new Map() // exact text -> { name, photo } | null (nobody, or more than one person)
const byId = new Map()
const waiting = new Set()
let pendingNames = new Set()
let pendingIds = new Set()
let timer = null

function schedule() {
  if (timer) return
  timer = setTimeout(async () => {
    timer = null
    const names = [...pendingNames]
    const ids = [...pendingIds]
    pendingNames = new Set()
    pendingIds = new Set()
    try {
      const reads = []
      if (names.length) reads.push(profilesApi.profiles().select('id, name, photo_url').in('name', names))
      if (ids.length) reads.push(profilesApi.profiles().select('id, name, photo_url').in('id', ids))
      const rows = (await Promise.all(reads)).flatMap((r) => r.data ?? [])
      for (const nm of names) {
        const hit = rows.filter((p) => p.name === nm)
        byName.set(nm, hit.length === 1 ? { name: hit[0].name, photo: hit[0].photo_url || null } : null)
      }
      for (const id of ids) {
        const p = rows.find((x) => x.id === id)
        byId.set(id, p ? { name: p.name, photo: p.photo_url || null } : null)
      }
    } catch {
      for (const nm of names) byName.set(nm, null)
      for (const id of ids) byId.set(id, null)
    }
    for (const fn of [...waiting]) fn()
  }, 40)
}

function resolve({ id, names }) {
  if (id) {
    if (byId.has(id)) return byId.get(id)
    pendingIds.add(id)
    schedule()
    return null
  }
  let missing = false
  for (const nm of names) {
    if (!byName.has(nm)) { pendingNames.add(nm); missing = true; continue }
    if (byName.get(nm)) return byName.get(nm)
  }
  if (missing) schedule()
  return null
}

/** `{ name, photo }` for the person a notification is about, or null (the row then shows initials). Rows share one batched read. */
export function useNotificationActor(n, enabled = true) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const fn = () => tick((x) => x + 1)
    waiting.add(fn)
    return () => { waiting.delete(fn) }
  }, [enabled])
  return enabled ? resolve(actorKeys(n)) : null
}
