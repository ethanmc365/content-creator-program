import { supabase } from './supabase'

// The community board's data layer, in one place.
//
// Everything the board does is one of four things: read the feed, read one
// thread, ask a question, answer one. Keeping them here rather than inline in
// the pages means the hub card and the full page cannot end up asking for
// subtly different shapes of the same list, which is how two surfaces of one
// feature start disagreeing about what "answered" means.

// THE FOUR TAGS.
//
// Ethan's four, and the labels are written as a person would say them out loud -
// "About a country", not "COUNTRY" - because they appear as chips on the card
// and as a choice in the composer, and a chip that reads like a database value
// makes the whole thing feel like a form.
//
// `other` is deliberately last and deliberately vague. A tag list with no escape
// hatch does not produce better tagging, it produces questions filed under
// whichever of the three was least wrong.
export const BOARD_TAGS = [
  { key: 'country', label: 'About a country', short: 'Country', icon: 'globe',
    hint: 'Somewhere specific: getting around, where to stay, what it actually costs.' },
  { key: 'travelling', label: 'About travelling', short: 'Travelling', icon: 'plane',
    hint: 'Flights, visas, kit, insurance, working on the road.' },
  { key: 'other_things', label: 'About making content', short: 'Content', icon: 'video',
    hint: 'Filming, editing, hooks, brands, rates, growing an account.' },
  { key: 'other', label: 'Something else', short: 'Other', icon: 'chat',
    hint: 'Anything that does not fit the other three.' },
]

export const tagInfo = (key) => BOARD_TAGS.find((t) => t.key === key) || BOARD_TAGS[3]

/**
 * The board feed. All filtering happens in Postgres (see migration 096) so the
 * search covers answers as well as questions - somebody looking for "eSIM"
 * wants the thread where the eSIM answer is, not only the ones that put the
 * word in the title.
 */
export async function loadFeed({ search = '', tag = null, state = null, limit = 50 } = {}) {
  const { data, error } = await supabase.rpc('board_feed', {
    q_search: search?.trim() || null,
    q_tag: tag || null,
    q_state: state || null,
    q_limit: limit,
    q_offset: 0,
  })
  if (error) throw error
  return data || []
}

/** One question and every answer on it, oldest answer first. */
export async function loadThread(id) {
  const [{ data: question }, { data: answers }] = await Promise.all([
    supabase
      .from('board_questions')
      .select('*, profiles:author_id(id, name, photo_url, city, country, is_admin)')
      .eq('id', id).eq('deleted', false).maybeSingle(),
    supabase
      .from('board_answers')
      .select('*, profiles:author_id(id, name, photo_url, city, country, is_admin)')
      .eq('question_id', id).eq('deleted', false)
      .order('created_at', { ascending: true }),
  ])
  return { question: question || null, answers: answers || [] }
}

export async function askQuestion({ authorId, title, body, tag, country }) {
  return supabase.from('board_questions').insert({
    author_id: authorId,
    title: title.trim(),
    body: (body || '').trim(),
    tag,
    country: tag === 'country' ? (country || '').trim() || null : null,
  }).select('id').single()
}

export async function postAnswer({ questionId, authorId, body }) {
  return supabase.from('board_answers').insert({
    question_id: questionId,
    author_id: authorId,
    body: body.trim(),
  }).select('*, profiles:author_id(id, name, photo_url, city, country, is_admin)').single()
}

/** Soft delete, so an answer's author can retract it without leaving a hole. */
export const removeQuestion = (id) =>
  supabase.from('board_questions').update({ deleted: true }).eq('id', id)

export const removeAnswer = (id) =>
  supabase.from('board_answers').update({ deleted: true }).eq('id', id)
