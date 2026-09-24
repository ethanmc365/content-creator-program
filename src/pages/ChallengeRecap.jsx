import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import YearInReview from '../components/wrapped/YearInReview'
import { buildChallengeCards, ChallengeShareCard } from '../components/wrapped/challengeStory'
import { Card, Eyebrow, Line } from '../components/wrapped/cards'
import { buildChallengeRecap } from '../lib/challengeRecap'
import { resolveThumbnail } from '../lib/videoThumbs'
import Icon from '../components/Icon'
import BackLink from '../components/BackLink'
import { Spinner } from '../components/ui'

// THE END-OF-CHALLENGE RECAP PAGE (24 Sep 2026). See lib/challengeRecap for
// the numbers and components/wrapped/challengeStory for the cards; the story
// runner is the Year in Review's own.
//
// Opens once a challenge has closed, for anybody who entered it. An admin can
// look at any creator's with `?as=<creator id>` - the way to check a recap
// before the community is told about it.

export default function ChallengeRecap() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const [state, setState] = useState({ status: 'loading' })
  const as = profile?.is_admin ? params.get('as') : null
  const who = as || profile?.id

  useEffect(() => {
    if (!who) return undefined
    let alive = true
    ;(async () => {
      const [{ data: challenge }, { data: subs }, { data: results }, { data: meRow }] = await Promise.all([
        supabase.from('challenges').select('id, title, status, scoring, start_date, end_date, prize_amount, prize_currency, community_id').eq('id', id).maybeSingle(),
        supabase.from('submissions').select('id, creator_id, logged_views, platform, video_url, thumbnail_url, profiles:creator_id(is_test)').eq('challenge_id', id).limit(5000),
        supabase.from('results').select('creator_id, rank, final_views, group_id').eq('challenge_id', id),
        supabase.from('profiles').select('id, name, photo_url, country').eq('id', who).maybeSingle(),
      ])
      if (!alive) return
      if (!challenge || !meRow) { setState({ status: 'missing' }); return }
      const ended = challenge.status === 'archived' || (challenge.end_date && Date.parse(challenge.end_date) < Date.now())
      if (!ended && !profile?.is_admin) { setState({ status: 'locked', challenge }); return }

      // Rewards: a creator reads their own; an admin previewing reads the
      // creator's through the admin policy.
      const { data: rewards } = await supabase.from('rewards')
        .select('amount, currency, reward_type, prize_slot, status')
        .eq('challenge_id', id).eq('creator_id', who)

      const hidden = new Set((subs || []).filter((s) => s.profiles?.is_test).map((s) => s.creator_id))
      const recap = buildChallengeRecap({ challenge, me: meRow, submissions: subs || [], results: results || [], rewards: rewards || [], hidden })
      if (!recap.entered) { setState({ status: 'none', challenge }); return }

      // FRAMES FOR THE TOP VIDEOS, found before the story starts so the card
      // never swaps a placeholder for a picture mid-animation.
      const withThumbs = await Promise.all(recap.top.map(async (v) => (
        v.thumbnail ? v : { ...v, thumbnail: await resolveThumbnail(v.url).catch(() => null) }
      )))
      if (!alive) return
      setState({ status: 'ready', data: { ...recap, top: withThumbs } })
    })()
    return () => { alive = false }
  }, [id, who, profile?.is_admin])

  return (
    <div className="page max-w-3xl">
      <BackLink to={`/challenges/${id}`} label="Back to the challenge" />
      {as && (
        <p className="mb-4 rounded-xl bg-cloud px-4 py-2.5 text-xs text-smoke">
          <Icon name="eye" className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
          Previewing another creator&rsquo;s recap as an admin.
        </p>
      )}
      {state.status === 'loading' && (
        <div className="flex h-[60vh] items-center justify-center"><Spinner /></div>
      )}
      {state.status === 'ready' && (
        <YearInReview
          data={state.data}
          build={buildChallengeCards}
          Share={ChallengeShareCard}
          fileStem={`tryp-${(state.data.challenge.title || 'challenge').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        />
      )}
      {(state.status === 'locked' || state.status === 'none' || state.status === 'missing') && (
        <div className="mx-auto w-full max-w-[400px]">
          <Card palette="ember" className="aspect-[9/16]" footer={false}>
            <Eyebrow palette="ember">Challenge recap</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
                <Icon name={state.status === 'locked' ? 'lock' : 'video'} className="h-7 w-7" />
              </span>
              <p className="text-[32px] font-extrabold leading-[1.05] tracking-tight">
                {state.status === 'locked' ? <>Still running.</> : state.status === 'none' ? <>No entries<br />on this one.</> : <>Nothing here.</>}
              </p>
              <Line palette="ember">
                {state.status === 'locked'
                  ? 'Your recap opens the moment the challenge closes. Every video you post until then is in it.'
                  : state.status === 'none'
                    ? 'A recap is made from the videos you enter. The next challenge is a fresh start.'
                    : 'That challenge could not be found.'}
              </Line>
            </div>
            <Link to={`/challenges/${id}`} className="mt-6 inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-bold text-brand">
              Back to the challenge <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      )}
    </div>
  )
}
