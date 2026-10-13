import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'
import Icon from './Icon'
import LocalTime from './LocalTime'
import { pickWhoToMeet } from '../lib/whoToMeet'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'
import SectionTitle from './network/SectionTitle'
import { testFlags } from '../lib/testData'
import { flagEmoji } from '../lib/countries'
import { profilesApi } from '../api/profiles'

// WHO TO MEET THIS WEEK.
//
// Three faces, and each one says why. The reasoning and every phrasing live in
// lib/whoToMeet; the long note at the top of that file is the argument for the
// whole feature, and the short version is: "suggested for you" is the emptiest
// phrase in software, and a written reason is what turns a face into an opening
// line.
//
// WHY IT SITS ABOVE THE SPOTLIGHT
//
// The spotlight is one creator the whole community is looking at today. This is
// three creators picked for YOU. Both are "here are some people", and the
// personal one has to come first or the reader has already decided the section
// is generic by the time they reach it.
//
// IT NEVER SUGGESTS SOMEBODY YOU ARE ALREADY CONNECTED TO. The entire value is
// meeting somebody new; a card recommending a person you message every day is
// the feature announcing that it does not know anything about you.

// WHAT KIND OF OVERLAP THIS IS, as a glyph. The reason sentences are written by
// hand (see lib/whoToMeet) and each one has a `kind`; this is the only place
// that turns a kind into a picture, so a new reason gets a new line here and
// nothing else has to know.
const REASON_ICON = {
  trip: 'plane',
  destination: 'pin',
  been: 'globe',
  knows: 'users',
  city: 'pin',
  language: 'chat',
  countries: 'globe',
  platform: 'video',
  chance: 'sparkles',
}

// The short label above each reason: the kind of overlap in two words.
const REASON_LABEL = {
  trip: 'Same trip',
  destination: 'Same destination',
  been: 'Been there',
  knows: 'Knows the place',
  city: 'Same city',
  language: 'Both speak',
  countries: 'Shared places',
  platform: 'Same platform',
  chance: 'Worth a hello',
}

export default function WhoToMeet({ className }) {
  const tr = useT()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  // Which suggestion's Message button is mid-round-trip, so one spinner does not
  // freeze all three.
  const [picks, setPicks] = useState(null)

  useEffect(() => {
    if (!user?.id || !profile) return undefined
    let alive = true

    async function load() {
      const today = format(new Date(), 'yyyy-MM-dd')
      const [{ data: people }, { data: trips }, { data: rels }] = await Promise.all([
        profilesApi.profiles()
          .select('id, name, photo_url, bio, city, country, country_code, city_lng, languages, countries_visited, instagram_url, tiktok_url, youtube_url, facebook_url')
          .eq('status', 'active').in('is_test', testFlags()).eq('is_admin', false)
          .is('deletion_requested_at', null),
        // Everything upcoming, for everybody. The overlap test needs both sides,
        // and the whole table of future trips is a few dozen rows.
        supabase.from('collab_posts')
          .select('creator_id, city, country, start_date, end_date')
          .gte('end_date', today),
        // Who the viewer is already connected to, either way round.
        profilesApi.connections()
          .select('creator_id, connected_creator_id, status')
          .or(`creator_id.eq.${user.id},connected_creator_id.eq.${user.id}`),
      ])
      if (!alive) return

      const known = new Set([user.id])
      for (const r of rels || []) {
        if (r.status === 'declined') continue
        known.add(r.creator_id === user.id ? r.connected_creator_id : r.creator_id)
      }

      const byCreator = {}
      for (const t of trips || []) (byCreator[t.creator_id] ||= []).push(t)

      // ADMINS RUN OUT OF STRANGERS, AND THAT IS NOT A REASON TO HIDE THE
      // SECTION FROM THEM.
      //
      // The filter below is the whole point of the feature for a creator: never
      // suggest somebody you already know. But the programme lead is connected
      // to essentially every creator on the platform by the second week, so
      // `candidates` came back empty, `picks` came back empty, and the component
      // returned null - on Ethan's hub only. It looked like the section was
      // broken; it was working exactly as written and had simply run out of
      // people. A test creator with two connections saw it fine, which is why it
      // read as an account-specific bug.
      //
      // So for an admin, and ONLY when the strict pass finds nobody, we fall
      // back to the full pool. A creator's rule is untouched.
      const strangers = (people || []).filter((p) => !known.has(p.id))
      const isAdmin = profile?.is_admin || profile?.platform_role === 'owner'
        || profile?.platform_role === 'global_admin'
      const candidates = strangers.length || !isAdmin ? strangers : (people || []).filter((p) => p.id !== user.id)

      setPicks(pickWhoToMeet({ ...profile, id: user.id }, candidates, {
        ...byCreator,
        [user.id]: byCreator[user.id] || [],
      }))
    }

    load()
    return () => { alive = false }
  }, [user?.id, profile])

  // A DM IS OPENED, NOT CREATED (9 Sep 2026). `openConversation` INSERTS a row,
  // so pressing Message and then changing your mind left an empty thread in two
  // inboxes. `/messages?to=` opens the thread either way and Messages.jsx
  // creates the row on the first send - see `ensureConversation` there. It is
  // also instant, which the round trip this replaced was not.
  function message(id) {
    navigate(`/messages?to=${id}`)
  }

  // Nothing at all to suggest: everybody is already a connection, or the
  // community is three people. Render nothing rather than an empty heading.
  if (!picks?.length) return null

  return (
    <section className={className}>
      {/* The title is the way to everybody (network/SectionTitle); the
          "Everyone →" link beside it is gone, like the hub's other sections. */}
      <div className="mb-4">
        <SectionTitle icon="users" to="/creators" label={tr('Everyone')}>{tr("Who to meet")}</SectionTitle>
      </div>

      {/* TO MEET, REDESIGNED (12 Oct 2026). Ethan: "I think you can design
          them much, much better." The old card was a centred avatar, a name,
          a boxed reason and two equal buttons - three stacked full-width
          blocks on a phone, one screen of scrolling for three people.

          Now the reason LEADS: a small brand label naming the overlap ("Same
          trip", "Both speak") above the sentence, because that is what makes
          a stranger worth a message. The face sits beside it with the flag of
          where they are and their local time. One primary action (Say hi) and
          the profile as a quiet arrow. On a phone the three cards are a snap
          row you swipe through, each a little narrower than the screen so the
          next one peeks in; from `sm` they are a three-up grid. The whole card
          still opens the profile from dead space (stretched link). */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
        {picks.map(({ creator, reason }, i) => {
          const chance = reason.kind === 'chance'
          const flag = creator.country_code ? flagEmoji(creator.country_code) : ''
          return (
            <div
              key={creator.id}
              style={{ animationDelay: `${i * 70}ms` }}
              className="group relative flex w-[82%] shrink-0 snap-start animate-fade-up flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-all duration-200 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift sm:w-auto"
            >
              <Link
                to={`/profile/${creator.id}`}
                className="absolute inset-0 z-0 rounded-card"
                aria-label={`${creator.name}'s profile`}
              />
              {/* THE BRAND BAND ALONG THE TOP, THICKER AND RUNNING DOWN INTO THE CARD (12 Oct 2026). Ethan: "you added this
                  orange, just a little gradient line at the top, which looks good. Although it's too thin, it should be a
                  bit thicker, so make it go down more." A solid band, then a soft wash of the same colour fading out behind
                  the avatar. It fades for the "no particular reason" pick. */}
              <span aria-hidden className={cx('h-2.5 w-full bg-gradient-to-r from-brand to-[#f5853f]', chance && 'opacity-30')} />
              <span aria-hidden className={cx('pointer-events-none absolute inset-x-0 top-2.5 h-16 bg-gradient-to-b from-[#f5853f]/25 via-brand-tint/40 to-transparent', chance && 'opacity-40')} />

              <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-4">
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0 transition-transform duration-200 group-hover:scale-105">
                    <Avatar src={creator.photo_url} name={creator.name} size="lg" />
                    {flag && (
                      <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm leading-none shadow-card ring-2 ring-white">
                        {flag}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold leading-tight transition-colors group-hover:text-brand">{creator.name}</p>
                    {(creator.city || creator.country) && (
                      <p className="mt-0.5 truncate text-[13px] text-smoke">{[creator.city, creator.country].filter(Boolean).join(', ')}</p>
                    )}
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-smoke">
                      <Icon name="clock" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <LocalTime profile={creator} bare className="tabular-nums" />
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex-1 border-t border-gray-100 pt-3">
                  <p className={cx('flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide', chance ? 'text-smoke' : 'text-brand')}>
                    <Icon name={REASON_ICON[reason.kind] || 'sparkles'} className="h-4 w-4 shrink-0" />
                    {tr(REASON_LABEL[reason.kind] || 'Worth a hello')}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">{reason.text}</p>
                </div>
              </div>

              <div className="relative z-10 flex items-center gap-2 px-4 pb-4">
                <button
                  type="button"
                  onClick={() => message(creator.id)}
                  className="btn-primary flex flex-1 items-center justify-center gap-1.5 !py-2.5 text-sm"
                >
                  <Icon name="chat" className="h-4 w-4" />
                  {tr('Say hi')}
                </button>
                <Link
                  to={`/profile/${creator.id}`}
                  aria-label={tr('Profile')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-ink transition-transform hoverable:hover:scale-105"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
