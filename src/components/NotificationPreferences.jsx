import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useUnread } from '../context/UnreadContext'
import { Modal, Panel, Toggle } from './ui'
import Icon from './Icon'
import FlagStack from './network/FlagStack'
import { enablePush, pushSupported, pushPermission, showLocalNotification } from '../lib/push'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// Whether this device has EVER had push granted. Local, because it is a fact
// about the device rather than about the account: the same creator on a laptop
// and a phone can honestly answer differently, and the point of it is to tell
// "you switched these off" apart from "you never switched these on".
const PUSH_EVER_KEY = 'tryp-push-granted-once'

// Notification preferences, extracted from the old standalone page so they can
// live INLINE inside the Settings page (one place, no click-through). The state
// hook is owned once by the parent and shared by both the creator sections and
// the admin section, so toggling one never clobbers the other's keys in the
// single profiles.notif_prefs JSON blob.

// What creators can switch on and off. Keys match the notification `type`
// column and the profiles.notif_prefs JSON.
//
// `emailable` used to mark the categories that also went out by email. Email
// notifications are OFF across the board as of Jul 27 2026 (see EMAIL_ENABLED
// below), so the flag currently does nothing but is left in place: it records
// which categories are worth an email if and when they come back.
export const CATEGORIES = [
  { key: 'challenge', label: 'New challenges', hint: 'When a fresh challenge goes live.', emailable: true },
  { key: 'event', label: 'Events', hint: 'Q&As, content days and milestones on the calendar.', emailable: true },
  { key: 'dm', label: 'Direct messages', hint: 'When another creator messages you directly, or in a group.' },
  // Chat notifications are throttled server-side (one per room every 15
  // minutes, and never while you're actively in the app), so a busy room costs
  // a nudge rather than a stream of buzzes. See migrations 067 and 217.
  { key: 'chat', label: 'Room messages', hint: 'New messages in the rooms you are in. At most one nudge per room every 15 minutes.', pushOnly: true },
  { key: 'mention', label: 'Mentions and replies', hint: 'When somebody @-names you in a room. Arrives even from a room you have switched off.' },
  { key: 'results', label: 'Results', hint: "When a challenge's results are published." },
  { key: 'reward', label: 'Rewards', hint: 'When a reward or payout comes your way.' },
  { key: 'connection', label: 'New connections', hint: 'When a creator connects with you.' },
]

// WHAT CANNOT BE SWITCHED OFF, AND WHY IT IS A LIST RATHER THAN AN ABSENCE.
//
// Ethan: "creators should have ability to choose custom settings like turn off
// notifications for certain chats, but never for announcements or anything from
// the Tryp.com."
//
// `announcement` used to be the first row of CATEGORIES with a toggle on it, so
// the one channel the programme uses to reach everybody - a challenge closing,
// a payout, a change of rules - was the easiest one to turn off. It is shown
// here instead, drawn as a row with a padlock where the switch was, because
// silently dropping it from the list would read as a feature that had gone
// missing. The rule is ALSO enforced in the database (`room_muted` answers
// false for an announcements room whatever the saved array says) and in
// notify-dispatch, because a client that forgets to hide a switch must not be
// able to take the broadcast channel down.
export const LOCKED_CATEGORIES = [
  { key: 'announcement', label: 'Announcements from Tryp.com', hint: 'Challenge deadlines, payouts and anything the team needs every creator to see. These always arrive.' },
]

// Admin-only alerts (hidden from regular creators). Push and the in-app bell
// only, same as everything else while email notifications are off.
export const ADMIN_CATEGORIES = [
  { key: 'application', label: 'New creator applications', hint: 'When a creator submits their profile for review.', emailable: true },
  { key: 'submission', label: 'New challenge entries', hint: 'When a creator submits a video to a challenge.', emailable: true },
  { key: 'new_member', label: 'New creators joined', hint: 'When a creator is approved and becomes active.', emailable: true },
  { key: 'referral', label: 'New referrals', hint: 'When a creator logs a referral lead.', emailable: true },
  { key: 'deletion', label: 'Account deletion requests', hint: 'When a creator schedules their account for deletion.', emailable: true },
  { key: 'inactive', label: 'Inactive creators', hint: 'When a creator has not logged in for 30+ days.', emailable: true },
  { key: 'feedback', label: 'Bug reports & ideas', hint: 'When a creator reports a bug or suggests a feature.', emailable: true },
]

const DEFAULT_PREFS = Object.fromEntries(
  [...CATEGORIES, ...LOCKED_CATEGORIES].map((c) => [c.key, true]),
)
// Only the emailable categories default to on; everything else is push-only.
const DEFAULT_EMAIL = { announcement: true, challenge: true, event: true, dm: false, chat: false, connection: false, results: false, reward: false }

// Email notifications are OFF (Jul 27 2026).
//
// Mailing the whole community from a shared mailbox got the platform flagged as
// a bulk sender, and Gmail started blocking the messages. Rather than ship
// toggles for something that does not reliably arrive, the Email column is
// hidden and notify-dispatch no longer sends email at all. The platform now
// emails only password resets and one welcome message per new creator.
//
// Everything behind this flag (the toggles, the email_prefs writes, DEFAULT_EMAIL)
// is left intact, so flipping it back to true is all it takes once there is a
// verified sending domain.
const EMAIL_ENABLED = false

// Shared state owned once by the parent (Settings). Both the creator and admin
// sections read/write the SAME prefs object, so writes always carry every key.
export function useNotificationPrefs() {
  const { user, profile, refreshProfile } = useAuth()
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(profile?.notif_prefs || {}) })
  const [emailPrefs, setEmailPrefs] = useState({ ...DEFAULT_EMAIL, ...(profile?.email_prefs || {}) })
  const [reminderDays, setReminderDays] = useState(profile?.challenge_reminder_days ?? [3, 1])
  const [permission, setPermission] = useState(pushPermission())
  const [busy, setBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  async function togglePush(key, value) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    await supabase.from('profiles').update({ notif_prefs: next }).eq('id', user.id)
    refreshProfile()
  }

  // ONE ROOM OFF, RATHER THAN ALL OF THEM.
  //
  // Ethan: "be able to turn off 'meetups' chat." The list lives in the SAME
  // `notif_prefs` blob as the category switches - `muted_rooms`, an array of
  // namespaced channel keys - rather than in a table of its own, because it is
  // a preference of exactly the same kind and a second store would be a second
  // thing to keep in step. Every write carries the whole object, which is why
  // this state is owned once by the parent (see the note above the hook): two
  // components each holding their own copy would overwrite each other's keys.
  //
  // An ANNOUNCEMENTS room can never enter the array. The UI does not offer it,
  // and the database ignores it if it somehow arrives - see `room_muted`.
  const mutedRooms = useMemo(() => {
    const list = prefs?.muted_rooms
    return new Set(Array.isArray(list) ? list : [])
  }, [prefs])

  async function toggleRoom(channel, on) {
    if (!channel || channel.split(':').pop() === 'announcements') return
    const next = new Set(mutedRooms)
    if (on) next.delete(channel); else next.add(channel)
    const merged = { ...prefs, muted_rooms: [...next] }
    setPrefs(merged)
    await supabase.from('profiles').update({ notif_prefs: merged }).eq('id', user.id)
    refreshProfile()
  }
  async function toggleEmail(key, value) {
    const next = { ...emailPrefs, [key]: value }
    setEmailPrefs(next)
    await supabase.from('profiles').update({ email_prefs: next }).eq('id', user.id)
    refreshProfile()
  }
  async function toggleReminderDay(d) {
    const next = reminderDays.includes(d) ? reminderDays.filter((x) => x !== d) : [...reminderDays, d].sort((a, b) => b - a)
    setReminderDays(next)
    await supabase.from('profiles').update({ challenge_reminder_days: next }).eq('id', user.id)
    refreshProfile()
  }
  async function turnOnPush() {
    setBusy(true); setPushMsg('')
    const result = await enablePush(user.id)
    setPermission(pushPermission()); setBusy(false)
    if (result === 'granted') setPushMsg('Notifications are on for this device.')
    else if (result === 'denied') setPushMsg('Your browser is blocking notifications. Enable them in your browser settings, then try again.')
    else if (result === 'unsupported') setPushMsg('This browser does not support push notifications.')
    else setPushMsg('Something went wrong turning on notifications. Please try again.')
  }
  // THERE IS NO "TURN OFF" BUTTON, AND THAT IS DELIBERATE (1 Sep 2026).
  //
  // Ethan: "remove the turn off push notifications button, we shouldn't have
  // this button, once they enabled they enabled but creators can obviously turn
  // them off on the actual settings on their phone."
  //
  // He is right, and the reason is that this button never did what it looked
  // like it did. It dropped the SUBSCRIPTION but it cannot touch the browser
  // PERMISSION, so pressing it left the device permanently permitted and
  // silently unsubscribed - a state no operating system setting explains and
  // which reads as "notifications are broken". The switch that genuinely turns
  // them off lives in iOS and Android settings, is one somebody already knows
  // how to find, and is honest about what it does.
  //
  // What is left in here is per-TYPE control, which is the thing a creator
  // actually wants ("stop telling me about new members, keep telling me about
  // challenges"), and which this page has always had.

  // AND THE APP NOTICES WHEN THEY DO TURN THEM OFF THERE.
  //
  // Ethan: "ensure the app notices if they do this and prompts them to
  // re-enable them again." The permission is only read on mount, so a creator
  // who switched it off in iOS settings and came back saw "On for this device"
  // for ever. It is re-read whenever the tab is shown again, which is exactly
  // when they get back from the settings app.
  useEffect(() => {
    const recheck = () => setPermission(pushPermission())
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [])

  // Whether this device HAD a subscription. A creator who has been turned off
  // at the OS level is not the same as one who never switched it on, and the
  // prompt has to be able to tell them apart - "turn these back on" is the
  // wrong sentence for somebody who has never had them.
  const [hadPush, setHadPush] = useState(() => {
    try { return localStorage.getItem(PUSH_EVER_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    if (permission !== 'granted') return
    try { localStorage.setItem(PUSH_EVER_KEY, '1') } catch { /* private mode */ }
    setHadPush(true)
  }, [permission])

  return { prefs, emailPrefs, reminderDays, permission, hadPush, busy, pushMsg, mutedRooms, togglePush, toggleEmail, toggleReminderDay, toggleRoom, turnOnPush }
}

// A single per-type row with a push toggle (and, once email is live, an email one).
function PrefRow({ c, state }) {
  const tr = useT()
  return (
    <div className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{c.label}</p>
        <p className="text-xs text-smoke">{c.hint}</p>
      </div>
      <div className="flex w-11 justify-center">
        <Toggle on={state.prefs[c.key] !== false} onChange={(v) => state.togglePush(c.key, v)} label={`${c.label} push`} />
      </div>
      {EMAIL_ENABLED && (
        <div className="flex w-11 justify-center">
          {/* Only a few categories are worth emailing; the rest show a dash so
              it's clear they're in-app/push only rather than switched off. */}
          {c.emailable
            ? <Toggle on={state.emailPrefs[c.key] === true} onChange={(v) => state.toggleEmail(c.key, v)} label={`${c.label} email`} />
            : <span className="text-[11px] text-gray-300" title={tr("This one is in-app and push only")}>-</span>}
        </div>
      )}
    </div>
  )
}

// A setting that exists and is not yours to change. A padlock where the switch
// would be, at the same size and in the same column, so the row still scans as
// part of the list rather than as a gap in it.
function LockedRow({ label, hint }) {
  const tr = useT()
  return (
    <div className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{tr(label)}</p>
        <p className="text-xs text-smoke">{tr(hint)}</p>
      </div>
      <span
        className="flex w-11 shrink-0 items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand"
        title={tr('This one cannot be switched off')}
      >
        <Icon name="lock" className="h-3.5 w-3.5" />
      </span>
    </div>
  )
}

// ROOM BY ROOM.
//
// Ethan: "creators should have ability to choose custom settings like turn off
// notifications for certain chats, but never for announcements or anything from
// the Tryp.com, but for example be able to turn off 'meetups' chat."
//
// THE SHAPE IS THE ROOMS PAGE'S SHAPE, ON PURPOSE. A flat list of rooms in a
// six-market community is four Generals, four Announcements and four Meetups
// with nothing to say which is which - the exact problem /rooms exists to
// solve. Grouped by place, with the flag, it is the same mental model in both
// screens, so a creator who wants "stop telling me about Germany" can see
// Germany.
//
// It reads its room list from the shared unread store rather than issuing a
// query of its own: that store already knows every room you are in, keyed by
// the same namespaced channel string the mute is saved under.
function RoomNotifications({ state }) {
  const tr = useT()
  const { rooms } = useUnread()

  const places = useMemo(() => {
    const out = new Map()
    for (const r of rooms) {
      if (!out.has(r.community_id)) out.set(r.community_id, { place: r.place, rooms: [] })
      out.get(r.community_id).rooms.push(r)
    }
    return [...out.values()].sort(
      (a, b) => (b.place.kind === 'network') - (a.place.kind === 'network')
        || a.place.name.localeCompare(b.place.name),
    )
  }, [rooms])

  const mutedCount = state.mutedRooms.size

  if (!places.length) {
    return <p className="mt-2 text-sm text-smoke">{tr('Your rooms appear here once you have joined a market.')}</p>
  }

  return (
    <div className="mt-2 space-y-5">
      {places.map(({ place, rooms: rs }) => (
        <div key={place.id}>
          <div className="flex items-center gap-2 pb-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cloud text-[13px] leading-none">
              {place.kind === 'network'
                ? <Icon name="globe" className="h-3.5 w-3.5 text-brand" />
                : <FlagStack codes={place.country_codes} className="text-[13px]" max={1} />}
            </span>
            <p className="min-w-0 truncate text-[13px] font-bold text-ink">{place.name}</p>
          </div>
          <div className="rounded-xl border border-gray-100">
            {rs.map((r) => {
              const locked = r.key === 'announcements'
              const on = !state.mutedRooms.has(r.channel)
              return (
                <div key={r.id} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0">
                  <Icon name={r.icon || 'chat'} className={cx('h-4 w-4 shrink-0', on ? 'text-brand' : 'text-gray-300')} />
                  <span className={cx('min-w-0 flex-1 truncate text-[13px]', on ? 'font-medium text-ink' : 'text-smoke')}>
                    {tr(r.label)}
                  </span>
                  {locked ? (
                    <span className="flex w-11 shrink-0 items-center justify-center text-brand" title={tr('This one cannot be switched off')}>
                      <Icon name="lock" className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <div className="flex w-11 shrink-0 justify-center">
                      <Toggle on={on} onChange={(v) => state.toggleRoom(r.channel, v)} label={`${place.name} ${r.label}`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {/* WHAT YOU HAVE DONE, IN ONE SENTENCE. A screen of thirty switches that
          never summarises itself is a screen you have to re-read to audit. */}
      <p className="text-xs text-smoke">
        {mutedCount === 0
          ? tr('Every room can reach you. Announcements always can.')
          : `${mutedCount} ${mutedCount === 1 ? tr('room is switched off. You will still see its messages in the app, and you will still be told when somebody names you in it.') : tr('rooms are switched off. You will still see their messages in the app, and you will still be told when somebody names you in one.')}`}
      </p>
    </div>
  )
}

// The heading of one block. It used to be a `border-t` divider inside a single
// tall card; now each block IS a card on a desktop, so the rule is the card's
// own edge and this is just the title.
function BlockTitle({ title, hint }) {
  return (
    <div className="mb-1">
      {/* HEAVIER THAN THE ROWS UNDER IT. Ethan: "notification settings,
          everything seems a bit clustered there." On a desktop each block is a
          card and the card's edge does the separating; on a PHONE a Panel draws
          nothing at all, so a `text-sm font-semibold` block title sat at exactly
          the same weight as the `text-sm font-semibold` name of every setting
          below it - four headings and eighteen rows, all the same size, with no
          edges. It read as one undifferentiated wall of switches, which is the
          clustering. */}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-smoke">{hint}</p>}
    </div>
  )
}

// FOUR BLOCKS, NOT ONE WALL.
//
// Ethan: "for the notification settings, I feel like it's hard to read, and it
// doesn't really make sense. I would change the UI and improve it."
//
// It was one `card` about nine hundred pixels tall holding four unrelated
// decisions - whether this browser may buzz you, which of eight categories you
// want, when to be reminded about a deadline, and when to be reminded about a
// puzzle - separated by hairlines and introduced by an <h2> reading
// "Notifications" directly under a page heading reading "Notifications". So the
// first thing on the page was a repetition and the rest was a scroll.
//
// Each block is its own `Panel` now: a card on a desktop, a plain block on a
// phone (see the note there). The duplicate heading and its strapline are gone,
// and so is the "PUSH" column label - email is off across the board, so it was
// a heading over the only column there is.
export function CreatorNotifications({ state }) {
  const tr = useT()
  const supported = pushSupported()
  return (
    // `divide-y` under `sm` is the card edge a Panel does not draw on a phone.
    // Above `sm` every block IS a card, so the rule would be a line inside a
    // border - hence the breakpoint on both halves.
    <div className="max-sm:divide-y max-sm:divide-gray-100 max-sm:[&>*:not(:first-child)]:pt-6 max-sm:[&>*:not(:last-child)]:pb-6 sm:space-y-5">
      {/* ---- This device ---- */}
      <Panel className="space-y-4">
        <BlockTitle
          title={tr("This device")}
          hint={tr("Alerts even when the app is closed. Add the app to your home screen for the best experience.")}
        />
        {!supported ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-smoke">
            {tr("This browser does not support push notifications. Try Chrome, Edge or installing the app to your home screen.")}
          </p>
        ) : state.permission === 'granted' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" /> {tr("On for this device")}
            </span>
            <button onClick={() => showLocalNotification({ title: 'Tryp.com', body: 'Test notification - you are all set!', link: '/notifications' })} className="btn-secondary !py-2 text-xs">
              {tr("Send a test")}
            </button>
            {/* No "Turn off". See the note beside `turnOnPush`: it could never
                do what it looked like it did, and the switch that can is in the
                phone's own settings. */}
          </div>
        ) : state.permission === 'denied' ? (
          // BLOCKED AT THE OPERATING SYSTEM, AND SAID SO.
          //
          // `Notification.requestPermission()` resolves instantly with 'denied'
          // once a device has been told no - it does not re-prompt - so an
          // "Enable notifications" button here is a button that cannot work.
          // What it needs is the two sentences that tell somebody where the
          // real switch is. `hadPush` picks which two: a creator who had them
          // and lost them is being told something changed, and a creator who
          // never turned them on is being told how.
          <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-tint/30 px-4 py-3.5">
            <Icon name="mute" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand">
                {state.hadPush ? tr('Notifications were switched off on this device') : tr('This device is blocking notifications')}
              </p>
              <p className="mt-0.5 text-sm text-smoke">
                {state.hadPush
                  ? tr('You had these on. Your phone is blocking them now, so you are missing challenge deadlines, replies and results.')
                  : tr('We cannot ask again from here once a device has said no.')}
              </p>
              <p className="mt-2 text-xs text-smoke">
                {tr('Turn them back on in Settings → Notifications → Tryp.com (iPhone), or by pressing the padlock beside the address bar and allowing notifications (browser).')}
              </p>
              <button
                onClick={state.turnOnPush}
                disabled={state.busy}
                className="btn-secondary mt-3 !py-2 text-xs"
              >
                {tr('I have turned them on - check again')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={state.turnOnPush} disabled={state.busy} className="btn-primary"
            data-tour="enable-push">
            {state.busy ? 'Enabling…' : 'Enable notifications on this device'}
          </button>
        )}
        {state.pushMsg && <p className="text-sm text-smoke">{state.pushMsg}</p>}
      </Panel>

      {/* ---- What you're notified about ---- */}
      <Panel>
        <BlockTitle
          title={tr("What you're notified about")}
          hint={EMAIL_ENABLED
            ? 'Email is reserved for the things worth leaving the app for. A dash means in-app and push only.'
            : 'Your in-app bell always keeps a record, whatever you turn off here.'}
        />
        {EMAIL_ENABLED && (
          <div className="mt-3 flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span className="w-11 text-center">{tr("Push")}</span>
            <span className="w-11 text-center">{tr("Email")}</span>
          </div>
        )}
        <div className="mt-2">
          {/* The locked ones lead, because a list that opens with eight
              switches and buries the one thing you cannot change at the bottom
              is a list that has hidden it. */}
          {LOCKED_CATEGORIES.map((c) => <LockedRow key={c.key} label={c.label} hint={c.hint} />)}
          {CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
        </div>
      </Panel>

      {/* ---- Room by room ----
          Only worth drawing when "Room messages" is on: a per-room switch
          underneath a master switch that is already off is a control that
          cannot do anything, and offering it is how somebody ends up believing
          they have turned a room back on. */}
      <Panel>
        <BlockTitle
          title={tr("Your rooms")}
          hint={tr("Switch off a room you would rather not be nudged about. You still see everything in the app.")}
        />
        {state.prefs.chat === false ? (
          <p className="mt-2 rounded-xl bg-cloud px-4 py-3 text-sm text-smoke">
            {tr("Room messages are off above, so no room is sending you anything. Turn them back on to choose room by room.")}
          </p>
        ) : (
          <RoomNotifications state={state} />
        )}
      </Panel>

      {/* ---- Challenge deadline reminders ---- */}
      <Panel>
        <BlockTitle title={tr("Challenge deadline reminders")} hint={tr("A nudge before a live challenge closes, so you can get your entries in.")} />
        <DeadlineReminderDays state={state} />
      </Panel>

      {/* ---- Daily puzzle reminders ---- */}
      <Panel>
        <BlockTitle title={tr("Daily puzzle reminders")} hint={tr("Never break a run on Guess the Country or Flight Path. Push only.")} />
        <div className="mt-2">
          <div className="flex items-center gap-4 border-b border-gray-100 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{tr("Streak reminder")}</p>
              <p className="text-xs text-smoke">{tr("If your streak is at risk, we’ll nudge you around 6pm to play before midnight.")}</p>
            </div>
            <div className="flex w-11 justify-center">
              <Toggle on={state.prefs.daily_streak !== false} onChange={(v) => state.togglePush('daily_streak', v)} label={tr("Daily streak reminder")} />
            </div>
          </div>
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{tr("Remind me to play")}</p>
              <p className="text-xs text-smoke">{tr("A gentle reminder around 10am each day to play the daily puzzles.")}</p>
            </div>
            <div className="flex w-11 justify-center">
              <Toggle on={state.prefs.daily_reminder === true} onChange={(v) => state.togglePush('daily_reminder', v)} label={tr("Daily puzzle reminder")} />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}


// Admin-only alert toggles. Rendered at the very bottom of Settings, only for
// admins. Shares the same prefs state as the creator section above.
export function AdminNotifications({ state }) {
  const tr = useT()
  return (
    <>
      <div className="flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span className="w-11 text-center">{tr("Push")}</span>
        {EMAIL_ENABLED && <span className="w-11 text-center">{tr("Email")}</span>}
      </div>
      {ADMIN_CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
      <p className="mt-4 text-xs text-smoke">
        {tr("These alerts only ever go to the Tryp.com Team. Creators never receive them, even by mistake.")}
      </p>
    </>
  )
}


// ---------------------------------------------------------------- deadlines
//
// THE SAME CONTROL IN TWO PLACES, WHICH IS THE WHOLE POINT.
//
// The lead times for a challenge deadline lived only in Settings, three taps
// from the calendar where the deadline is actually being looked at. The owner:
// "for the deadlines, the reminder should open up the settings page where you
// can select what reminders you want for deadlines, or instead even just open
// this particular section as a popup card, like the deadline notification
// section from settings still appears in settings but also as a popup here when
// you click the bell."
//
// So it is one component. Settings renders it inline; the calendar's bell
// renders it in a modal. Not two forms writing the same column - that is how
// the notification bell and the notifications page ended up disagreeing with
// each other, which took a rewrite to undo.
//
// WHY A DEADLINE IS DIFFERENT FROM EVERYTHING ELSE ON THE CALENDAR. Every other
// entry gets a one-off reminder pinned to that entry (`event_reminders`, keyed
// by the thing). A challenge deadline is not a one-off: the programme runs a
// new challenge every few weeks and nobody wants to re-arm a bell each time.
// The answer there is a STANDING preference - "always warn me three days out" -
// which is what `profiles.challenge_reminder_days` and the nightly
// `send_challenge_reminders` cron already implement. The bell on a deadline
// therefore opens the standing setting rather than creating a row.
export function DeadlineReminderDays({ state }) {
  const tr = useT()
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {[14, 7, 5, 3, 1].map((d) => {
          const on = state.reminderDays.includes(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => state.toggleReminderDay(d)}
              aria-pressed={on}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                on
                  ? 'bg-brand text-white shadow-card'
                  : 'border border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
              )}
            >
              {on && <Icon name="check" className="h-3.5 w-3.5" />}
              {d} day{d > 1 ? 's' : ''} before
            </button>
          )
        })}
      </div>
      {state.reminderDays.length === 0 && (
        // NOT AMBER. The palette here is brand orange and charcoal, and this is
        // not a warning anyway - it is a consequence of a choice somebody just
        // made deliberately.
        <p className="mt-3 text-xs text-smoke">
          {tr("Nothing selected, so we will not remind you before a challenge closes.")}
        </p>
      )}
    </>
  )
}

/** The same control, as a card over the calendar. See DeadlineReminderDays. */
export function DeadlineReminderModal({ open, onClose }) {
  const tr = useT()
  const state = useNotificationPrefs()
  return (
    <Modal open={open} onClose={onClose} title={tr("Remind me before a deadline")}>
      <div className="space-y-4">
        <p className="text-sm text-smoke">
          {tr("This is a standing setting, not a one-off: it applies to every challenge the programme runs, so you never have to arm it again.")}
        </p>
        <DeadlineReminderDays state={state} />
        <p className="flex items-start gap-2 rounded-xl bg-cloud/60 p-3 text-xs text-smoke">
          <Icon name="bell" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          <span>
            {tr("Reminders arrive as a push notification.")}
          </span>
        </p>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-primary">{tr("Done")}</button>
        </div>
      </div>
    </Modal>
  )
}
