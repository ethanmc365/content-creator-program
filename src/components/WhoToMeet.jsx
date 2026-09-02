import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'
import Icon from './Icon'
import LocalTime from './LocalTime'
import { pickWhoToMeet } from '../lib/whoToMeet'
import { openConversation } from '../lib/dm'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

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

export default function WhoToMeet({ className }) {
  const tr = useT()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  // Which suggestion's Message button is mid-round-trip, so one spinner does not
  // freeze all three.
  const [opening, setOpening] = useState(null)
  const [picks, setPicks] = useState(null)

  useEffect(() => {
    if (!user?.id || !profile) return undefined
    let alive = true

    async function load() {
      const today = format(new Date(), 'yyyy-MM-dd')
      const [{ data: people }, { data: trips }, { data: rels }] = await Promise.all([
        supabase.from('profiles')
          .select('id, name, photo_url, bio, city, country, country_code, city_lng, languages, countries_visited, instagram_url, tiktok_url, youtube_url, facebook_url')
          .eq('status', 'active').eq('is_test', false).eq('is_admin', false)
          .is('deletion_requested_at', null),
        // Everything upcoming, for everybody. The overlap test needs both sides,
        // and the whole table of future trips is a few dozen rows.
        supabase.from('collab_posts')
          .select('creator_id, city, country, start_date, end_date')
          .gte('end_date', today),
        // Who the viewer is already connected to, either way round.
        supabase.from('connections')
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

  // Opening a conversation is a round trip (it finds or creates the thread), so
  // the button says which one it is working on rather than freezing all three.
  async function message(id) {
    setOpening(id)
    try {
      const convId = await openConversation(user.id, id)
      navigate(convId ? `/messages/${convId}` : '/messages')
    } finally {
      setOpening(null)
    }
  }

  // Nothing at all to suggest: everybody is already a connection, or the
  // community is three people. Render nothing rather than an empty heading.
  if (!picks?.length) return null

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="users" className="h-5 w-5 shrink-0 text-brand" /> {tr("Who to meet")}
          </h2>
          {/* Not "three creators picked for you" - you can see how many there
              are, and counting them out is the kind of line a page says when it
              has nothing else to say. */}
        </div>
        <Link to="/creators" className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
          {tr("Everyone →")}
        </Link>
      </div>

      {/* THE CARD IS NO LONGER ONE BIG LINK.
          It was a single <a> around everything, which is why there was nothing
          to DO with a suggestion except look at it - anything you put inside a
          link either becomes part of the link or breaks the HTML. Ethan: "design
          them better and have an action button to message them or something."
          He is right that it was the missing half: the reason text is written
          to be an opening line, and there was no way to open with it.
          So: a card with a STRETCHED link underneath the content (the whole
          card still opens the profile from any dead space) and two real
          controls on top of it. Same pattern the past-challenge cards use. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {picks.map(({ creator, reason }, i) => (
          <div
            key={creator.id}
            style={{ animationDelay: `${i * 70}ms` }}
            className="group relative flex animate-fade-up flex-col rounded-card border border-gray-100 bg-white p-5 text-center shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"
          >
            <Link
              to={`/profile/${creator.id}`}
              className="absolute inset-0 z-0 rounded-card"
              aria-label={`${creator.name}'s profile`}
            />

            {/* z-10 so the content sits above the stretched link; the buttons
                inside it get their own pointer events back, everything else
                stays click-through to the profile. */}
            <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center">
              <span className="transition-transform duration-200 group-hover:scale-105">
                <Avatar src={creator.photo_url} name={creator.name} size="lg" />
              </span>
              <p className="mt-3 w-full truncate text-sm font-semibold transition-colors group-hover:text-brand">
                {creator.name}
              </p>
              <p className="mt-0.5 flex w-full items-center justify-center gap-1.5 truncate text-xs text-smoke">
                {(creator.city || creator.country) && (
                  <span className="truncate">{[creator.city, creator.country].filter(Boolean).join(', ')}</span>
                )}
                {(creator.city || creator.country) && <span aria-hidden className="text-gray-300">&middot;</span>}
                <LocalTime profile={creator} bare className="shrink-0 tabular-nums" />
              </p>

              {/* THE REASON. It is the reason this component exists, so it gets
                  the emphasis: its own tinted panel rather than a grey caption
                  under the name. `flex-1` pushes the buttons to the bottom, so
                  three cards with reasons of different lengths still line their
                  controls up. */}
              {/* THE REASON IS A LINE WITH A GLYPH, NOT A TINTED PANEL
                  (2 Sep 2026).

                  Ethan: "I don't like the colour of the little card that shows
                  the reason why you should connect, like you both speak Irish
                  or you have both been to the United Kingdom, Spain and
                  Portugal. You can improve the UI of this."

                  It was a `bg-brand-tint` wash - a beige rectangle inside a
                  white card inside a white page, which is the one colour move
                  this platform's rules do not allow (white-dominant, orange as
                  an ACCENT). And the wash was carrying no information: it was
                  the same block whatever the reason was.
                  So the panel goes white with the card's own hairline, and the
                  orange moves to a glyph that says what KIND of overlap this is
                  - a plane for a trip, a pin for a place, a globe for a country
                  you have both been to. The colour is now an accent doing a
                  job. */}
              <p className={cx(
                'mt-3 flex w-full flex-1 items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-xs leading-relaxed',
                reason.kind === 'chance'
                  ? 'border-gray-100 bg-cloud/40 text-smoke'
                  : 'border-brand/15 bg-white text-ink',
              )}>
                <Icon
                  name={REASON_ICON[reason.kind] || 'sparkles'}
                  className={cx('mt-px h-3.5 w-3.5 shrink-0', reason.kind === 'chance' ? 'text-gray-400' : 'text-brand')}
                />
                <span className="min-w-0">{reason.text}</span>
              </p>
            </div>

            <div className="relative z-10 mt-3 flex gap-2">
              <Link
                to={`/profile/${creator.id}`}
                className="btn-secondary flex-1 !py-2 text-xs"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={() => message(creator.id)}
                disabled={opening === creator.id}
                className="btn-primary flex-1 !py-2 text-xs"
              >
                {opening === creator.id ? 'Opening…' : 'Message'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
