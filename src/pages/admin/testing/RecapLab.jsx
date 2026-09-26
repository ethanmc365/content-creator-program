import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { LabPage, Panel, Note, Stage, useStage } from './kit'
import { Avatar, Select, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import RecapBanner from '../../../components/challenge/RecapBanner'
import { formatDate } from '../../../lib/utils'

// THE CHALLENGE RECAP, BEFORE ANY CREATOR SEES IT (26 Sep 2026).
//
// Ethan: "We have the recap that you built in, which will be at the end of the
// challenge for anyone who entered. See the 'Your recap ready' banner. Where
// exactly will this show up? ... build it into the test centre. Exactly how it
// will look, I can test it and then make any changes to it."
//
// Like the Year in Review lab this runs over REAL data, read-only: pick a
// challenge and anybody who entered it, and the frame below loads the actual
// recap page as that creator (`?as=`, admin only), on a phone or a desktop.
// A challenge that is still running is shown as if it had just closed - the
// page lets an admin past the "still running" lock for exactly this.

export default function RecapLab() {
  const stage = useStage('phone')
  const [challenges, setChallenges] = useState(null)
  const [challengeId, setChallengeId] = useState('')
  const [entrants, setEntrants] = useState(null)
  const [who, setWho] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    supabase.from('challenges')
      .select('id, title, status, start_date, end_date')
      .neq('status', 'draft')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (!alive) return
        setChallenges(data || [])
        if (data?.[0]) setChallengeId(data[0].id)
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!challengeId) return undefined
    let alive = true
    setEntrants(null)
    ;(async () => {
      const [{ data: subs }, { data: res }] = await Promise.all([
        supabase.from('submissions').select('creator_id, profiles:creator_id(id, name, photo_url, is_test)').eq('challenge_id', challengeId).limit(1000),
        supabase.from('results').select('creator_id, rank').eq('challenge_id', challengeId),
      ])
      if (!alive) return
      const rank = new Map((res || []).map((r) => [r.creator_id, r.rank]))
      const by = new Map()
      for (const s of subs || []) {
        if (!s.profiles || s.profiles.is_test) continue
        const cur = by.get(s.creator_id) || { ...s.profiles, entries: 0, rank: rank.get(s.creator_id) ?? null }
        cur.entries += 1
        by.set(s.creator_id, cur)
      }
      const list = [...by.values()].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      setEntrants(list)
      setWho(list[0]?.id || '')
    })()
    return () => { alive = false }
  }, [challengeId])

  const challenge = useMemo(() => (challenges || []).find((c) => c.id === challengeId), [challenges, challengeId])
  const person = (entrants || []).find((e) => e.id === who)
  const src = challengeId && who ? `/challenges/${challengeId}/recap?as=${who}&r=${reload}` : null
  const running = challenge?.status === 'active'

  return (
    <LabPage
      title="Challenge recap"
      icon="sparkles"
      sandbox={false}
      subtitle="The story a creator gets when a challenge closes: where they placed, their top videos and a card to share. Real data, read-only."
    >
      <Panel i={0} title="Whose recap" hint="Pick a challenge and anybody who entered it. Places are listed first.">
        <div className="grid gap-3 sm:grid-cols-2">
          {challenges === null ? <Skeleton className="h-11 w-full rounded-xl" /> : (
            <Select
              variant="field"
              ariaLabel="Challenge"
              value={challengeId}
              onChange={setChallengeId}
              options={challenges.map((c) => ({ value: c.id, label: `${c.title} · ${formatDate(c.end_date)}${c.status === 'active' ? ' (running)' : ''}` }))}
            />
          )}
          {entrants === null ? <Skeleton className="h-11 w-full rounded-xl" /> : (
            <Select
              variant="field"
              ariaLabel="Creator"
              value={who}
              onChange={setWho}
              options={entrants.map((e) => ({
                value: e.id,
                label: `${e.rank ? `#${e.rank} ` : ''}${e.name} · ${e.entries} ${e.entries === 1 ? 'entry' : 'entries'}`,
              }))}
            />
          )}
        </div>
        {running && (
          <Note className="mt-3" icon="clock">
            <p>This challenge is still running. Creators cannot open their recap until it closes; you are seeing it as it would look if it closed now.</p>
          </Note>
        )}
      </Panel>

      <Panel i={1} title="Where creators find it" hint="Two doors, both automatic. Nothing has to be sent by hand.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-smoke">1 · The notification</p>
            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-card">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                <Icon name="trophy" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Results are in: {challenge?.title || 'the challenge'}</p>
                <p className="mt-0.5 text-xs text-smoke">The final leaderboard is published. See where you finished, and open your recap.</p>
                <p className="mt-1 text-[11px] text-gray-400">Push + bell · the moment the winners are published</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-smoke">Goes to everybody who entered, once, when you press Publish final leaderboard. It opens the challenge page.</p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-smoke">2 · The banner on the challenge</p>
            <RecapBanner onClick={() => setReload((n) => n + 1)} />
            <p className="text-xs leading-relaxed text-smoke">At the top of the challenge page, under the title, from the moment the challenge closes, for anyone who entered. Pressing it opens the story below.</p>
          </div>
        </div>
      </Panel>

      <Panel
        i={2}
        title={person ? `${person.name.split(' ')[0]}'s recap` : 'The recap'}
        hint="The real page, loaded as this creator. Tap through the cards exactly as they would. Switch to desktop to check the wide layout."
        action={person && <Avatar src={person.photo_url} name={person.name} size="sm" />}
      >
        {src ? (
          <Stage src={src} label="Recap page" {...stage} height={stage.device === 'phone' ? 820 : 900} />
        ) : (
          <Skeleton className="h-[600px] w-full rounded-card" />
        )}
      </Panel>
    </LabPage>
  )
}
