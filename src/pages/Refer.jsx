import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import { formatDate } from '../lib/utils'
import { referralStage } from '../lib/referrals'
import { useT } from '../lib/i18n'

// Creators refer other creators ONE way: they share their personal invite link
// (/signup?ref=CODE), which credits them automatically.
//
// There used to be a second path, a form for handing the team somebody's name
// and handle to chase up. It is gone. It produced a referral nobody could
// track, it needed a human to act on it, and it competed with the link for
// attention on the one page whose whole job is to get the link shared. The
// `referrals` table still holds the rows it wrote, so the history below keeps
// showing them.
//
// A referral only counts once the person they referred submits a video to a
// challenge (see lib/referrals.js) - that is what the reward is tied to.
const STATUS_TONE = { new: 'amber', contacted: 'light', joined: 'green', declined: 'grey' }

export default function Refer() {
  const tr = useT()
  const { user, profile } = useAuth()
  const [referrals, setReferrals] = useState([])
  const [joined, setJoined] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const inviteLink = `${window.location.origin}/signup?ref=${profile?.referral_code ?? ''}`

  const [participatedCount, setParticipatedCount] = useState(0)
  const [linkClicks, setLinkClicks] = useState(0)

  async function load() {
    const [{ data: refs }, { data: joinedProfiles }, { data: me }] = await Promise.all([
      supabase.from('referrals').select('*').eq('referrer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, photo_url, created_at, status, onboarded').eq('referred_by', user.id),
      supabase.from('profiles').select('referral_clicks').eq('id', user.id).single(),
    ])
    setReferrals(refs ?? [])
    setLinkClicks(me?.referral_clicks ?? 0)

    // Which referred creators have actually submitted a challenge video? That is
    // what counts towards the €20 voucher reward. Tag each person with their
    // stage so the history list can show exactly where they've got to.
    const list = joinedProfiles ?? []
    const joinedIds = list.map((p) => p.id)
    let submitted = new Set()
    if (joinedIds.length) {
      const { data: subs } = await supabase.from('submissions').select('creator_id').in('creator_id', joinedIds)
      submitted = new Set((subs ?? []).map((s) => s.creator_id))
    }
    const withStage = list
      .map((p) => ({ ...p, stage: referralStage(p, submitted.has(p.id)) }))
      .sort((a, b) => b.stage.step - a.stage.step || new Date(b.created_at) - new Date(a.created_at))
    setJoined(withStage)
    setParticipatedCount(withStage.filter((p) => p.stage.key === 'counted').length)
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function copyLink() {
    navigator.clipboard?.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title={tr("Refer a creator")}
      />

      {/* Reward incentive + progress */}
      <section className="mb-8 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-7 text-white shadow-lift sm:p-8">
        <p className="text-xl font-bold sm:text-2xl">{tr("Refer 3 creators, earn a €20 Tryp.com voucher")}</p>
        <p className="mt-2 max-w-2xl text-sm text-white/85">
          When 3 creators you refer join and take part in a challenge, you earn a €20 Tryp.com voucher.
          All referrals are verified by the Tryp.com team to make sure they're genuine, active creators.
        </p>
        <div className="mt-5 max-w-sm">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-white/90">
            <span>{tr("Your progress")}</span>
            <span>{Math.min(participatedCount, 3)} / 3 participating</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.min((participatedCount / 3) * 100, 100)}%` }} />
          </div>
          {participatedCount >= 3 && (
            <p className="mt-2 text-sm font-semibold">{tr("You've hit 3! The team will verify and send your voucher.")}</p>
          )}
        </div>
      </section>

      {/* Invite link */}
      <section className="card mb-8">
        <h2 className="text-lg font-semibold">{tr("Your invite link")}</h2>
        <p className="mt-1 text-sm text-smoke">{tr("Anyone who signs up with this link is credited to you automatically.")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={inviteLink} className="input flex-1 text-sm" onFocus={(e) => e.target.select()} />
          <button onClick={copyLink} className="btn-primary shrink-0">{copied ? 'Copied ✓' : 'Copy link'}</button>
        </div>

        {/* Your invite funnel: how the link is converting, stage by stage. */}
        {!loading && (linkClicks > 0 || joined.length > 0) && (
          <div className="mt-6 border-t border-gray-50 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-smoke">{tr("Your invite funnel")}</p>
            <div className="space-y-2.5">
              {[
                { label: 'Link clicks', value: linkClicks },
                { label: 'Signed up', value: joined.length },
                { label: 'Approved', value: joined.filter((p) => p.status === 'active').length },
                { label: 'Participated in a challenge', value: participatedCount },
              ].map((stage, i, stages) => {
                const max = Math.max(stages[0].value, 1)
                return (
                  <div key={stage.label} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-smoke sm:w-48">{stage.label}</span>
                    {/* A stage with nothing in it renders NO bar at all, not a
                        bar of width zero. The fill carries `pr-2` so its number
                        clears the rounded end, and padding is inside the box:
                        a 0%-wide element still paints its 8px of padding, which
                        is the sliver of orange that sat under "0 signed up" and
                        made the picture contradict the number. */}
                    <div className="h-5 flex-1 overflow-hidden rounded-full bg-cloud">
                      {stage.value > 0 && (
                        <div
                          className={`flex h-full items-center justify-end rounded-full pr-2 text-[10px] font-bold text-white transition-all duration-700 ${i === 0 ? 'bg-brand-light' : 'bg-brand'}`}
                          style={{ width: `${Math.max((stage.value / max) * 100, 8)}%` }}
                        >
                          {stage.value}
                        </div>
                      )}
                    </div>
                    {stage.value === 0 && <span className="text-xs tabular-nums text-smoke">0</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">{tr("Your referrals")}</h2>
        <p className="mb-4 text-xs text-smoke">{tr("Follow each person's progress. A referral counts once they submit a video to a challenge.")}</p>
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : referrals.length === 0 && joined.length === 0 ? (
          <EmptyState icon={<Icon name="share" className="h-7 w-7" />} title={tr("No referrals yet")} hint={tr("Share your link to get started.")} />
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {joined.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-smoke">{p.stage.hint} · {formatDate(p.created_at)}</p>
                </div>
                <Badge tone={p.stage.tone} title={p.stage.hint}>{p.stage.label}</Badge>
              </div>
            ))}
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.referred_name}</p>
                  <p className="truncate text-xs text-smoke">{r.referred_contact || 'No contact'} · {formatDate(r.created_at)}</p>
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
