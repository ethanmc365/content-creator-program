import { describe, it, expect } from 'vitest'
import { templateFromForm, formFromTemplate, templateSummary, TEMPLATE_FIELDS } from './challengeTemplates'

// THE TESTS ARE THE SPECIFICATION, because what this module gets wrong is not
// visible on screen. A template that carries a date looks exactly like one that
// does not until a challenge opens in the past.

const form = {
  title: 'Hidden gems',
  description: '<p>Film somewhere nobody films.</p>',
  rules: '<p>One video, one city.</p>',
  platforms: ['Instagram', 'TikTok'],
  prize_structure: [{ place: 1, prize: '£150 cash', amount: 150 }],
  participation_threshold: '3',
  participation_prize: '£10 voucher',
  prize_currency: 'GBP',
  scoring: 'points',
  threshold_mode: 'highest',
  format: 'monthly',
  objective: 'views',
  cpm_target: '0.50',
  // None of these may survive.
  startDateStr: '01/09/2026', startTimeStr: '09:00',
  endDateStr: '30/09/2026', endTimeStr: '23:59',
  status: 'active',
  community_id: 'a-real-market-uuid',
  prize_amount: 150,
  winners_count: 3,
}

const rules = [
  { id: 'db-row-uuid', challenge_id: 'live-challenge', community_id: 'uk', created_at: 'x',
    kind: 'bonus', label: 'Tag the location', points: 2, prompt: 'Did you tag it?' },
]

const groups = [
  { id: 'group-uuid', name: 'Newcomers', prize_currency: 'GBP', prize_structure: [],
    participation_threshold: '', participation_prize: '', members: ['creator-a', 'creator-b'] },
]

describe('templateFromForm', () => {
  const payload = templateFromForm(form, rules, groups)

  it('keeps the brief - the words, the prizes, how it is judged', () => {
    expect(payload.title).toBe('Hidden gems')
    expect(payload.rules).toBe('<p>One video, one city.</p>')
    expect(payload.prize_structure).toEqual([{ place: 1, prize: '£150 cash', amount: 150 }])
    expect(payload.scoring).toBe('points')
    expect(payload.platforms).toEqual(['Instagram', 'TikTok'])
  })

  it('drops the dates, which is the field nobody would notice was wrong', () => {
    for (const key of ['startDateStr', 'startTimeStr', 'endDateStr', 'endTimeStr']) {
      expect(payload, key).not.toHaveProperty(key)
    }
  })

  it('drops the status, so using a template can never publish anything', () => {
    expect(payload).not.toHaveProperty('status')
  })

  it('drops the market, so a template cannot move a challenge between markets', () => {
    expect(payload).not.toHaveProperty('community_id')
  })

  it('keeps a point rule and throws away the row it came from', () => {
    expect(payload.point_rules[0]).toEqual({
      kind: 'bonus', label: 'Tag the location', points: 2, prompt: 'Did you tag it?',
    })
  })

  it('keeps a group and throws away last month\'s roster', () => {
    expect(payload.groups[0].name).toBe('Newcomers')
    expect(payload.groups[0]).not.toHaveProperty('members')
    expect(payload.groups[0]).not.toHaveProperty('id')
  })

  it('survives being handed nothing at all', () => {
    expect(templateFromForm()).toEqual({ point_rules: [], groups: [] })
  })
})

describe('formFromTemplate', () => {
  it('round-trips the brief', () => {
    const { form: patch } = formFromTemplate(templateFromForm(form, rules, groups))
    expect(patch.title).toBe('Hidden gems')
    expect(patch.prize_currency).toBe('GBP')
    expect(patch.participation_prize).toBe('£10 voucher')
  })

  it('gives restored point rules seed ids, so they are INSERTED and never overwrite live rows', () => {
    // The whole forensics of migration 139 is that replacing rules by id takes
    // the awards with them. A restored rule must look brand new.
    const { rules: out } = formFromTemplate(templateFromForm(form, rules, groups))
    expect(out[0].id).toBe('seed-0')
    expect(out[0].label).toBe('Tag the location')
  })

  it('restores a group with an empty roster rather than no roster', () => {
    const { groups: out } = formFromTemplate(templateFromForm(form, rules, groups))
    expect(out[0].members).toEqual([])
  })

  it('leaves the form default alone for a field the template predates', () => {
    // An old template has no `threshold_mode`. The patch must not contain the
    // key at all, or it would write `undefined` over the form's default.
    const { form: patch } = formFromTemplate({ title: 'Old one' })
    expect(patch).toEqual({ title: 'Old one' })
    expect('threshold_mode' in patch).toBe(false)
  })

  it('ignores a key the form no longer reads', () => {
    const { form: patch } = formFromTemplate({ title: 'x', some_removed_field: 'boom' })
    expect(patch).not.toHaveProperty('some_removed_field')
  })

  it('survives an empty payload', () => {
    expect(formFromTemplate()).toEqual({ form: {}, rules: [], groups: [] })
  })
})

describe('the allow-list', () => {
  it('contains no field that identifies an instance rather than a shape', () => {
    for (const banned of ['id', 'status', 'community_id', 'startDateStr', 'endDateStr',
      'startTimeStr', 'endTimeStr', 'prize_amount', 'winners_count', 'market']) {
      expect(TEMPLATE_FIELDS, banned).not.toContain(banned)
    }
  })
})

describe('templateSummary', () => {
  it('says what is in the template without opening it', () => {
    expect(templateSummary(templateFromForm(form, rules, groups)))
      .toBe('1 prize · 1 point rule · 1 group · 2 platforms')
  })

  it('says nothing rather than "0 prizes" for an empty one', () => {
    expect(templateSummary({})).toBe('')
  })
})

describe('what the 24 Sep 2026 report found missing', () => {
  it('keeps whether taking part is counted in videos or points', () => {
    const p = templateFromForm({ participation_threshold: 18, participation_basis: 'points' })
    expect(formFromTemplate(p).form).toMatchObject({ participation_threshold: 18, participation_basis: 'points' })
  })

  it('keeps the timezone but never a bonus\'s dates', () => {
    const p = templateFromForm({ tz: 'Europe/Lisbon' }, [
      { id: 'x', kind: 'bonus', label: 'Week 2', points: 3, starts_at: '2026-09-28T00:00:00Z', ends_at: '2026-10-04T22:59:00Z' },
    ])
    expect(p.tz).toBe('Europe/Lisbon')
    expect(p.point_rules[0]).not.toHaveProperty('starts_at')
    expect(p.point_rules[0]).not.toHaveProperty('ends_at')
  })
})
