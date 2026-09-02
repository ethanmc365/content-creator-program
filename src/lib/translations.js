import { supabase } from './supabase'
import { setOverrides, DEFAULT_LOCALE } from './i18n'

// THE RUNTIME OVERRIDE LAYER, FETCHED (migration 168).
//
// `src/locales/es.js` is the dictionary that ships with the build.
// `public.translations` is what a market manager has corrected since, keyed on
// exactly the same English sentences. This is the fetch, and it is deliberately
// the only thing in the app that knows the table exists apart from the editor.
//
// IT NEVER BLOCKS AND IT NEVER THROWS. Every failure - offline, RLS, a table
// that has not been migrated yet - resolves to "no overrides", which leaves the
// bundled dictionary in place, which is a complete and correct screen. A
// translation layer that can take the app down is a worse product than one that
// is occasionally a version behind.

/** Fetch one language's overrides and install them. Resolves either way. */
export async function loadOverrides(code) {
  // English is the SOURCE, not a translation: there is nothing to override, and
  // asking would be a round trip on every English creator's boot.
  if (!code || code === DEFAULT_LOCALE) return
  try {
    const { data, error } = await supabase
      .from('translations')
      .select('source, value')
      .eq('locale', code)
    if (error || !data) return
    const map = {}
    for (const row of data) if (row.source && row.value) map[row.source] = row.value
    setOverrides(code, map)
  } catch {
    /* the bundled dictionary is a usable answer */
  }
}

/** Every override row for a language, newest first, for the editor. */
export async function listOverrides(code) {
  const { data, error } = await supabase
    .from('translations')
    .select('source, value, updated_at, updated_by, profiles:updated_by(name)')
    .eq('locale', code)
    .order('updated_at', { ascending: false })
  return { rows: data ?? [], error: error?.message ?? null }
}

/**
 * Write one string. An EMPTY value deletes the row rather than storing a blank:
 * a blank override would erase the label everywhere and the way back would be
 * invisible. Clearing the box means "use the bundled word", which is the only
 * sane reading of an empty field here.
 */
export async function saveOverride(code, source, value, byId) {
  const text = (value || '').trim()
  if (!text) {
    const { error } = await supabase
      .from('translations').delete().eq('locale', code).eq('source', source)
    return { error: error?.message ?? null, cleared: true }
  }
  const { error } = await supabase.from('translations').upsert({
    locale: code,
    source,
    value: text,
    updated_by: byId ?? null,
    updated_at: new Date().toISOString(),
  })
  return { error: error?.message ?? null, cleared: false }
}
