import { describe, expect, it } from 'vitest'
import { cleanSurvey, fromStarter, missingAnswer, pendingSurveys, responsesByDay, SURVEY_STARTERS, summarise, surveyProblem } from './surveys'

const platform = SURVEY_STARTERS.find((x) => x.key === 'platform')

describe('surveys (migration 291)', () => {
  it('will not save a survey with an unworded question or one option', () => {
    const s = fromStarter(platform)
    expect(surveyProblem(s)).toBeNull()
    expect(surveyProblem({ ...s, title: ' ' })).toMatch(/title/)
    const bad = { ...s, questions: [{ ...s.questions[1], options: ['Only one', ''] }] }
    expect(surveyProblem(bad)).toMatch(/two options/)
    expect(surveyProblem({ ...s, audience: 'challenge', challenge_id: null })).toMatch(/challenge/)
  })

  it('drops empty options and stale audience fields when cleaned', () => {
    const s = fromStarter(platform)
    s.questions[1].options.push('  ')
    s.community_ids = ['x']
    const c = cleanSurvey(s)
    expect(c.questions[1].options).not.toContain('')
    expect(c.community_ids).toEqual([])
  })

  it('finds the first required question left blank', () => {
    const qs = [{ id: 'a', type: 'rating', required: true }, { id: 'b', type: 'multi', required: true }, { id: 'c', type: 'text', required: false }]
    expect(missingAnswer(qs, {}).id).toBe('a')
    expect(missingAnswer(qs, { a: 4, b: [] }).id).toBe('b')
    expect(missingAnswer(qs, { a: 4, b: ['x'] })).toBeNull()
  })

  it('summarises ratings, choices and written answers, ignoring declines', () => {
    const survey = { questions: [
      { id: 'r', type: 'rating' },
      { id: 'm', type: 'multi', options: ['A', 'B'] },
      { id: 't', type: 'text' },
    ] }
    const rows = [
      { profile_id: '1', answers: { r: 5, m: ['A', 'B'], t: 'More challenges' }, created_at: '2026-10-01' },
      { profile_id: '2', answers: { r: 3, m: ['A'] }, created_at: '2026-10-02' },
      { profile_id: '3', declined: true, answers: {} },
    ]
    const s = summarise(survey, rows)
    expect(s.answered).toBe(2)
    expect(s.declined).toBe(1)
    expect(s.questions[0].average).toBe(4)
    expect(s.questions[0].spread).toEqual([0, 0, 1, 0, 1])
    expect(s.questions[1].counts).toEqual([{ option: 'A', count: 2 }, { option: 'B', count: 1 }])
    expect(s.questions[2].answers).toHaveLength(1)
  })

  it('asks only about surveys not answered and not put off this session', () => {
    const live = [{ id: 'a', created_at: '2' }, { id: 'b', created_at: '1' }, { id: 'c', created_at: '3' }]
    expect(pendingSurveys(live, [{ survey_id: 'a' }], ['c']).map((s) => s.id)).toEqual(['b'])
  })

  it('never asks about a test survey, and a random one only sometimes', () => {
    const live = [{ id: 't', is_test: true, created_at: '1' }, { id: 'r', timing: 'random', created_at: '2' }]
    expect(pendingSurveys(live, [], [], () => 0.9).map((s) => s.id)).toEqual([])
    expect(pendingSurveys(live, [], [], () => 0.1).map((s) => s.id)).toEqual(['r'])
  })

  it('a challenge template needs its challenge, and cleaning pins how it asks', () => {
    const s = fromStarter(SURVEY_STARTERS.find((x) => x.key === 'challenge'))
    expect(s.audience).toBe('challenge')
    expect(surveyProblem(s)).toMatch(/challenge/)
    const c = cleanSurvey({ ...s, challenge_id: 'c1', timing: 'random', mode: 'once', allow_decline: false })
    expect(c.timing).toBe('now')
    expect(c.mode).toBe('until_done')
    expect(c.allow_decline).toBe(true)
    expect(surveyProblem({ ...fromStarter(platform), timing: 'date', starts_at: null })).toMatch(/date/)
  })

  it('summarises a 0-10 scale with a recommend score, and yes or no', () => {
    const survey = { questions: [{ id: 's', type: 'scale' }, { id: 'y', type: 'yesno' }] }
    const rows = [
      { answers: { s: 10, y: 'yes' } }, { answers: { s: 9, y: 'yes' } }, { answers: { s: 5, y: 'no' } }, { answers: { s: 8 } },
    ]
    const out = summarise(survey, rows)
    expect(out.questions[0].score).toBe(25) // 2 promoters, 1 detractor, of 4
    expect(out.questions[0].spread[10]).toBe(1)
    expect(out.questions[1].counts).toEqual([{ option: 'yes', count: 2 }, { option: 'no', count: 1 }])
  })

  it('counts answers by day', () => {
    const d = responsesByDay([{ created_at: '2026-10-02T10:00' }, { created_at: '2026-10-01T09:00', declined: true }, { created_at: '2026-10-02T12:00' }])
    expect(d).toEqual([{ day: '2026-10-01', answered: 0, declined: 1 }, { day: '2026-10-02', answered: 2, declined: 0 }])
  })
})
