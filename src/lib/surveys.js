// SURVEYS: THE ARITHMETIC AND THE RULES, AWAY FROM THE SCREENS (30 Sep 2026, migration 291).
//
// A survey is a list of questions. Four kinds, which between them cover "ask the creators for ideas
// or feedback on the platform":
//   rating   1 to 5 stars                         -> a number
//   choice   pick one of the options              -> the option's text
//   multi    pick any of the options              -> an array of option texts
//   text     write something                      -> a string
// Answers are stored as { [questionId]: value } so reordering or renaming a question never breaks
// the answers already in.

export const QUESTION_TYPES = [
  { key: 'rating', label: 'Rating (1 to 5)', icon: 'star' },
  { key: 'choice', label: 'Pick one', icon: 'check' },
  { key: 'multi', label: 'Pick any', icon: 'squares' },
  { key: 'text', label: 'Written answer', icon: 'pencil' },
]

export const AUDIENCES = [
  { key: 'everyone', label: 'Every creator' },
  { key: 'markets', label: 'Creators in chosen markets' },
  { key: 'challenge', label: 'Everyone who entered a challenge', hint: 'Shown once the challenge has ended' },
]

export const MODES = [
  { key: 'until_done', label: 'Keep asking until they answer', hint: 'It pops up each time they open the app, until they answer or say no.' },
  { key: 'once', label: 'Ask once', hint: 'It pops up one time. Closing it counts as a no.' },
]

let seq = 0
export function newQuestion(type = 'rating') {
  seq += 1
  return {
    id: `q${Date.now().toString(36)}${seq}`,
    type,
    prompt: '',
    options: type === 'choice' || type === 'multi' ? ['', ''] : [],
    required: type !== 'text',
  }
}

export function blankSurvey() {
  return {
    title: '',
    intro: '',
    questions: [newQuestion('rating'), newQuestion('text')],
    audience: 'everyone',
    community_ids: [],
    challenge_id: null,
    mode: 'until_done',
    allow_decline: true,
    status: 'draft',
    starts_at: null,
    ends_at: null,
  }
}

/** Ready-made surveys to start from, so the first one takes a minute rather than a blank page. */
export const SURVEY_STARTERS = [
  {
    key: 'platform',
    title: 'How is the platform working for you?',
    intro: 'Two minutes. Every answer is read by the team and shapes what we build next.',
    questions: [
      { type: 'rating', prompt: 'How easy is the platform to use?', required: true },
      { type: 'multi', prompt: 'Which parts do you use most?', options: ['Challenges', 'Rooms and messages', 'Calendar', 'Games', 'My portfolio'], required: false },
      { type: 'text', prompt: 'What one thing would make it better?', required: false },
    ],
  },
  {
    key: 'challenge',
    title: 'How was the challenge?',
    intro: 'You took part - tell us how it went, so the next one is better.',
    audience: 'challenge',
    questions: [
      { type: 'rating', prompt: 'How much did you enjoy this challenge?', required: true },
      { type: 'choice', prompt: 'Was the brief clear?', options: ['Very clear', 'Mostly clear', 'Not clear'], required: true },
      { type: 'text', prompt: 'Any ideas for future challenges?', required: false },
    ],
  },
  {
    key: 'ideas',
    title: 'Got an idea for us?',
    intro: 'We want your ideas for challenges, features and anything else.',
    questions: [
      { type: 'choice', prompt: 'What is your idea about?', options: ['A challenge', 'A new feature', 'Something else'], required: true },
      { type: 'text', prompt: 'Tell us about it', required: true },
    ],
  },
]

export function fromStarter(starter) {
  return {
    ...blankSurvey(),
    title: starter.title,
    intro: starter.intro,
    audience: starter.audience || 'everyone',
    questions: starter.questions.map((q) => ({ ...newQuestion(q.type), ...q, options: q.options ? [...q.options] : [] })),
  }
}

/** Why this survey cannot be saved as it is, or null. */
export function surveyProblem(s) {
  if (!s.title?.trim()) return 'Give the survey a title.'
  if (!s.questions?.length) return 'Add at least one question.'
  for (const [i, q] of s.questions.entries()) {
    if (!q.prompt?.trim()) return `Question ${i + 1} has no wording.`
    if ((q.type === 'choice' || q.type === 'multi') && q.options.filter((o) => o.trim()).length < 2) {
      return `Question ${i + 1} needs at least two options.`
    }
  }
  if (s.audience === 'markets' && !s.community_ids?.length) return 'Pick at least one market.'
  if (s.audience === 'challenge' && !s.challenge_id) return 'Pick the challenge.'
  return null
}

/** The survey as it should be stored: empty options dropped, fields trimmed. */
export function cleanSurvey(s) {
  return {
    ...s,
    title: s.title.trim(),
    intro: s.intro?.trim() || null,
    questions: s.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt.trim(),
      required: !!q.required,
      ...(q.type === 'choice' || q.type === 'multi' ? { options: q.options.map((o) => o.trim()).filter(Boolean) } : {}),
    })),
    community_ids: s.audience === 'markets' ? s.community_ids : [],
    challenge_id: s.audience === 'challenge' ? s.challenge_id : null,
  }
}

const answered = (q, v) => {
  if (v == null) return false
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0
  if (q.type === 'text') return String(v).trim().length > 0
  return v !== ''
}

/** The first required question left unanswered, or null when the answers can be sent. */
export function missingAnswer(questions, answers) {
  return (questions || []).find((q) => q.required && !answered(q, answers?.[q.id])) || null
}

/**
 * The results, question by question. `responses` are survey_responses rows (declined ones are
 * counted but carry no answers). Ratings give an average and a 1-5 spread; choices a count per
 * option (in the survey's order, plus anything answered that is no longer an option); text the
 * answers themselves, newest first.
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
    if (q.type === 'choice' || q.type === 'multi') {
      const counts = new Map((q.options || []).map((o) => [o, 0]))
      for (const { v } of values) for (const o of (Array.isArray(v) ? v : [v])) counts.set(o, (counts.get(o) || 0) + 1)
      return { ...q, n: values.length, counts: [...counts.entries()].map(([option, count]) => ({ option, count })) }
    }
    return {
      ...q,
      n: values.length,
      answers: values
        .map(({ v, r }) => ({ text: String(v), profile_id: r.profile_id, at: r.created_at }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at))),
    }
  })
  return { answered: answeredRows.length, declined, questions }
}

// Which surveys to ask about now. `surveys` are the live ones RLS lets this person read; `mine` their
// responses; `snoozed` the ids put off with "Later" in this session (sessionStorage).
export function pendingSurveys(surveys, mine, snoozed = []) {
  const done = new Set((mine || []).map((r) => r.survey_id))
  const later = new Set(snoozed)
  return (surveys || [])
    .filter((s) => !done.has(s.id) && !later.has(s.id))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}
