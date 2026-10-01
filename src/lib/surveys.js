// SURVEYS: THE ARITHMETIC AND THE RULES, AWAY FROM THE SCREENS (30 Sep 2026, migration 291;
// second pass 1 Oct 2026, migration 293).
//
// A survey is a list of questions. Six kinds:
//   rating   1 to 5 stars                         -> a number
//   scale    0 to 10 ("how likely ...")           -> a number
//   yesno    Yes or No                            -> 'yes' | 'no'
//   choice   pick one of the options              -> the option's text
//   multi    pick any of the options              -> an array of option texts
//   text     write something                      -> a string
// Answers are stored as { [questionId]: value } so reordering or renaming a question never breaks
// the answers already in. Each question may carry a `help` line shown under it.
//
// HOW IT ASKS IS NO LONGER A CHOICE (1 Oct 2026). Ethan: "I think we don't need the ask ones. It
// should just automatically keep asking until the answer, or if they select 'I don't want to take
// part'". Every survey keeps coming back each time the app opens until it is answered or declined,
// and declining asks once more, kindly, before it takes the no.

import { t } from './i18n'

export const QUESTION_TYPES = [
  { key: 'rating', label: 'Stars', hint: '1 to 5', icon: 'star' },
  { key: 'scale', label: 'Scale', hint: '0 to 10', icon: 'chart' },
  { key: 'yesno', label: 'Yes or no', hint: 'Two big buttons', icon: 'check' },
  { key: 'choice', label: 'Pick one', hint: 'From a list', icon: 'poll' },
  { key: 'multi', label: 'Pick any', hint: 'As many as they like', icon: 'squares' },
  { key: 'text', label: 'Written', hint: 'In their own words', icon: 'pencil' },
]
export const hasOptions = (type) => type === 'choice' || type === 'multi'

export const AUDIENCES = [
  { key: 'everyone', label: 'Every creator', hint: 'Everyone on the platform', icon: 'globe' },
  { key: 'markets', label: 'Chosen markets', hint: 'Only creators in the markets you pick', icon: 'pin' },
  { key: 'challenge', label: 'A challenge', hint: 'Everyone who entered, once it has ended', icon: 'flag' },
  { key: 'vip', label: 'VIP creators', hint: 'Every VIP, or just the VIPs of one market', icon: 'star' },
]

// When it first appears. A challenge survey always waits for the challenge to end (survey_is_for).
export const TIMINGS = [
  { key: 'now', label: 'Straight away', hint: 'The next time each creator opens the app', icon: 'bell' },
  { key: 'date', label: 'From a date', hint: 'It starts appearing on the day you pick', icon: 'calendar' },
  { key: 'random', label: 'At a random moment', hint: 'On one of their next few visits, not all at once', icon: 'sparkles' },
]

let seq = 0
export function newQuestion(type = 'rating') {
  seq += 1
  return {
    id: `q${Date.now().toString(36)}${seq}`,
    type,
    prompt: '',
    help: '',
    options: hasOptions(type) ? ['', ''] : [],
    required: type !== 'text',
  }
}

export function blankSurvey() {
  return {
    title: '',
    intro: '',
    thanks: '',
    questions: [newQuestion('rating'), newQuestion('text')],
    audience: 'everyone',
    community_ids: [],
    challenge_id: null,
    timing: 'now',
    mode: 'until_done',
    allow_decline: true,
    status: 'draft',
    starts_at: null,
    ends_at: null,
    is_test: false,
  }
}

/** Ready-made surveys to start from, so the first one takes a minute rather than a blank page. */
export const SURVEY_STARTERS = [
  {
    key: 'challenge',
    icon: 'flag',
    title: 'How was the challenge?',
    intro: 'You took part, so tell us how it went. It makes the next one better.',
    thanks: 'Thank you! We read every answer before we plan the next challenge.',
    audience: 'challenge',
    questions: [
      { type: 'rating', prompt: 'How much did you enjoy this challenge?', required: true },
      { type: 'choice', prompt: 'Was the brief clear?', options: ['Very clear', 'Mostly clear', 'Not clear'], required: true },
      { type: 'yesno', prompt: 'Would you take part in another one like it?', required: true },
      { type: 'choice', prompt: 'How did the prizes feel?', options: ['Worth it', 'About right', 'Not worth the effort'], required: false },
      { type: 'text', prompt: 'Any ideas for future challenges?', help: 'Destinations, formats, prizes, anything.', required: false },
    ],
  },
  {
    key: 'platform',
    icon: 'sparkles',
    title: 'How is the platform working for you?',
    intro: 'Two minutes. Every answer is read by the team and shapes what we build next.',
    thanks: 'Thank you! Your answers go straight to the team building the platform.',
    questions: [
      { type: 'rating', prompt: 'How easy is the platform to use?', required: true },
      { type: 'multi', prompt: 'Which parts do you use most?', options: ['Challenges', 'Rooms and messages', 'Calendar', 'Games', 'My portfolio'], required: false },
      { type: 'scale', prompt: 'How likely are you to recommend the community to a creator friend?', help: '0 is not at all, 10 is definitely.', required: true },
      { type: 'text', prompt: 'What one thing would make it better?', required: false },
    ],
  },
  {
    key: 'ideas',
    icon: 'bulb',
    title: 'Got an idea for us?',
    intro: 'We want your ideas for challenges, features and anything else.',
    thanks: 'Love it. Thank you for sharing your idea.',
    questions: [
      { type: 'choice', prompt: 'What is your idea about?', options: ['A challenge', 'A new feature', 'A destination', 'Something else'], required: true },
      { type: 'text', prompt: 'Tell us about it', required: true },
    ],
  },
  {
    key: 'payouts',
    icon: 'wallet',
    title: 'How were your rewards?',
    intro: 'A quick check on how getting paid and using vouchers went for you.',
    thanks: 'Thank you! This helps us pay everyone faster.',
    questions: [
      { type: 'rating', prompt: 'How smooth was getting your reward?', required: true },
      { type: 'yesno', prompt: 'Did your reward arrive when you expected?', required: true },
      { type: 'text', prompt: 'Anything we should fix?', required: false },
    ],
  },
  {
    key: 'content',
    icon: 'video',
    title: 'What do you want to film next?',
    intro: 'Help us pick the next challenges and destinations.',
    thanks: 'Thank you! Watch out for your ideas in the next challenges.',
    questions: [
      { type: 'multi', prompt: 'Which kinds of trips do you most like filming?', options: ['City breaks', 'Beach holidays', 'Mountains and nature', 'Food trips', 'Festivals and events'], required: true },
      { type: 'choice', prompt: 'How often do you post travel content?', options: ['Every day', 'A few times a week', 'Once a week', 'Less often'], required: true },
      { type: 'text', prompt: 'A destination you would love a challenge about', required: false },
    ],
  },
]

export function fromStarter(starter) {
  return {
    ...blankSurvey(),
    title: starter.title,
    intro: starter.intro,
    thanks: starter.thanks || '',
    audience: starter.audience || 'everyone',
    questions: starter.questions.map((q) => ({ ...newQuestion(q.type), ...q, help: q.help || '', options: q.options ? [...q.options] : [] })),
  }
}

/** Why this survey cannot be saved as it is, or null. */
export function surveyProblem(s) {
  if (!s.title?.trim()) return t('Give the survey a title.')
  if (!s.questions?.length) return t('Add at least one question.')
  for (const [i, q] of s.questions.entries()) {
    if (!q.prompt?.trim()) return t('Question {n} has no wording.', { n: i + 1 })
    if (hasOptions(q.type) && q.options.filter((o) => o.trim()).length < 2) {
      return t('Question {n} needs at least two options.', { n: i + 1 })
    }
  }
  if (s.audience === 'markets' && !s.community_ids?.length) return t('Pick at least one market.')
  if (s.audience === 'challenge' && !s.challenge_id) return t('Pick the challenge.')
  if (s.audience !== 'challenge' && s.timing === 'date' && !s.starts_at) return t('Pick the date it starts.')
  return null
}

/** The survey as it should be stored: empty options dropped, fields trimmed. */
export function cleanSurvey(s) {
  const timing = s.audience === 'challenge' ? 'now' : (s.timing || 'now')
  return {
    ...s,
    title: s.title.trim(),
    intro: s.intro?.trim() || null,
    thanks: s.thanks?.trim() || null,
    questions: s.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt.trim(),
      ...(q.help?.trim() ? { help: q.help.trim() } : {}),
      required: !!q.required,
      ...(hasOptions(q.type) ? { options: q.options.map((o) => o.trim()).filter(Boolean) } : {}),
    })),
    community_ids: s.audience === 'markets' || s.audience === 'vip' ? s.community_ids : [],
    challenge_id: s.audience === 'challenge' ? s.challenge_id : null,
    timing,
    starts_at: timing === 'date' ? s.starts_at : null,
    ends_at: null,
    mode: 'until_done',
    allow_decline: true,
  }
}

export const answered = (q, v) => {
  if (v == null) return false
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0
  if (q.type === 'text') return String(v).trim().length > 0
  return v !== ''
}

/** The first required question left unanswered, or null when the answers can be sent. */
export function missingAnswer(questions, answers) {
  return (questions || []).find((q) => q.required && !answered(q, answers?.[q.id])) || null
}

/** A rough "about N minutes", from what the questions ask for. */
export function minutesFor(questions) {
  const secs = (questions || []).reduce((s, q) => s + (q.type === 'text' ? 35 : 10), 0)
  return Math.max(1, Math.round(secs / 60))
}

/**
 * The results, question by question. `responses` are survey_responses rows (declined ones are
 * counted but carry no answers). Ratings and scales give an average and a spread; yes/no a split;
 * choices a count per option (in the survey's order, plus anything answered that is no longer an
 * option); text the answers themselves, newest first. A scale also gives a promoter score: the share
 * answering 9-10 minus the share answering 0-6.
 */
export function summarise(survey, responses) {
  const answeredRows = (responses || []).filter((r) => !r.declined)
  const declined = (responses || []).length - answeredRows.length
  const questions = (survey?.questions || []).map((q) => {
    const values = answeredRows.map((r) => ({ v: r.answers?.[q.id], r })).filter((x) => answered(q, x.v))
    if (q.type === 'rating') {
      const nums = values.map((x) => Number(x.v)).filter((n) => n >= 1 && n <= 5)
      const spread = [1, 2, 3, 4, 5].map((n) => nums.filter((x) => x === n).length)
      return { ...q, n: nums.length, average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, spread }
    }
    if (q.type === 'scale') {
      const nums = values.map((x) => Number(x.v)).filter((n) => n >= 0 && n <= 10)
      const spread = Array.from({ length: 11 }, (_, n) => nums.filter((x) => x === n).length)
      const promoters = nums.filter((x) => x >= 9).length
      const detractors = nums.filter((x) => x <= 6).length
      return {
        ...q,
        n: nums.length,
        average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        spread,
        score: nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : null,
      }
    }
    if (q.type === 'yesno') {
      const yes = values.filter((x) => x.v === 'yes').length
      const no = values.filter((x) => x.v === 'no').length
      return { ...q, n: yes + no, counts: [{ option: 'yes', count: yes }, { option: 'no', count: no }] }
    }
    if (hasOptions(q.type)) {
      const counts = new Map((q.options || []).map((o) => [o, 0]))
      for (const { v } of values) for (const o of (Array.isArray(v) ? v : [v])) counts.set(o, (counts.get(o) || 0) + 1)
      return { ...q, n: values.length, counts: [...counts.entries()].map(([option, count]) => ({ option, count })) }
    }
    return {
      ...q,
      n: values.length,
      answers: values
        .map(({ v, r }) => ({ text: String(v), profile_id: r.profile_id, sample_name: r.sample_name, at: r.created_at }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at))),
    }
  })
  return { answered: answeredRows.length, declined, questions }
}

/** Answers per day, for the "answers coming in" chart. */
export function responsesByDay(responses) {
  const m = new Map()
  for (const r of responses || []) {
    const d = String(r.created_at || '').slice(0, 10)
    if (!d) continue
    const x = m.get(d) || { day: d, answered: 0, declined: 0 }
    x[r.declined ? 'declined' : 'answered'] += 1
    m.set(d, x)
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day))
}

// Which surveys to ask about now. `surveys` are the live ones RLS lets this person read; `mine` their
// responses; `snoozed` the ids put off in this session (sessionStorage). A 'random' survey turns up
// on roughly one app open in three (`roll` is injectable for tests).
export function pendingSurveys(surveys, mine, snoozed = [], roll = Math.random) {
  const done = new Set((mine || []).map((r) => r.survey_id))
  const later = new Set(snoozed)
  return (surveys || [])
    .filter((s) => !s.is_test && !done.has(s.id) && !later.has(s.id))
    .filter((s) => s.timing !== 'random' || roll() < 0.34)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}
