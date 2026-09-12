import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Skeleton } from '../ui'
import Icon from '../Icon'
import { cx, formatDateTimeTz, timeAgo } from '../../lib/utils'
import { CONTEXT_MARK, sentryHome, sentryLink, sentryProjectId } from '../../lib/monitoring'
import { explain } from '../../lib/errorGuide'
import { toastSuccess } from '../../lib/toast'
import { useT } from '../../lib/i18n'

// IS ANYTHING BROKEN RIGHT NOW.
//
// Sentry is kept and is the right tool for DEBUGGING one crash: full stack
// traces, breadcrumbs, which release it started in. It is the wrong tool for
// the question an admin has while looking at the panel - "is anything broken
// now, and for how many people" - which needs no login, no second tab and no
// reading of stack frames.
//
// SO THIS IS A LIST OF PROBLEMS, NOT A LIST OF EVENTS. `report_client_error`
// fingerprints on the message and the route with ids and numbers filed off, so
// one fault that hit forty creators is one row saying forty, not forty rows to
// scroll past.
//
// ---------------------------------------------------------------------------
// THE REBUILD (8 Sep 2026), and it starts with why the list was empty.
//
// Ethan: "on the error monitoring - there were previous errors, it's not
// showing them, and it doesn't show what they are, which it should. Properly
// build out the error monitoring. It should show what the errors were, like
// where they happened, how to replicate them so I can fix it. And then a button
// to actually click whenever it's fixed, and then a log of the fixed ones."
//
// THE LIST WAS EMPTY BECAUSE NOTHING WAS EVER WRITTEN TO IT. `client_errors`
// had zero rows and had never had one: the reporting function threw on every
// call and swallowed the exception. Migration 204 has the forensics. So the
// first half of "build it properly" was a database fix, and the panel below it
// was reporting an empty table honestly.
//
// The second half is this file. A row now carries what it takes to REPRODUCE a
// fault rather than only to count it:
//
//   the message      what broke
//   the route        where in the app - the one field that was already here
//   the browser      "it only happens on iOS Safari" is most of a repro, and
//                    the panel could not say it
//   the component    the React stack: which component threw
//   the detail       the error's own stack, top frames
//   first and last   is this new, or has it been happening for a week
//
// All of that is behind a press, because the list has to stay scannable: the
// question you open this tab with is "how many", and the question you open a
// ROW with is "what is it".
//
// AND IT IS NOT ONLY BROWSER CRASHES ANY MORE. A cron job that failed writes
// here too (migration 205), because "something is broken and somebody has to do
// something" is the same question whichever half of the system it came from.
// `source` says which, and the filter chips let one be read without the other.
//
// TICKING ONE OFF IS NOT DELETING IT. `resolved_at` moves it to the ticked-off
// list, and the reporting function clears that the moment the same fingerprint
// arrives again - so a fault you thought you had fixed comes BACK to the top
// rather than staying hidden. That is the difference between a tick box and a
// dismiss button, and it is the whole reason to have the log of fixed ones that
// Ethan asked for.

// Where a row came from, as a chip. Ink rather than a new hue: the palette is
// white, ink and the two oranges (see the platform's design rules), so a blue
// "cron" badge would be the first off-palette colour on the platform.
const SOURCE_LABEL = { client: 'App', cron: 'Scheduled job', integration: 'Integration', system: 'System' }

export default function ErrorWatch() {
  const tr = useT()
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [showResolved, setShowResolved] = useState(false)
  const [source, setSource] = useState('all')
  // Which row is expanded. One at a time: this is a diagnostic view, and three
  // stack traces open at once is a page nobody can navigate.
  const [openRow, setOpenRow] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('client_errors')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(100)
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function resolve(row, done) {
    setRows((prev) => prev.map((r) => (r.fingerprint === row.fingerprint
      ? { ...r, resolved_at: done ? new Date().toISOString() : null } : r)))
    const { error } = await supabase.from('client_errors')
      .update({ resolved_at: done ? new Date().toISOString() : null, resolved_by: done ? user.id : null })
      .eq('fingerprint', row.fingerprint)
    // The result is read: a refused update resolves like a successful one in
    // supabase-js, and a fault silently un-ticked is one nobody looks at again.
    if (error) load()
  }

  const all = rows || []
  const open = all.filter((r) => !r.resolved_at)
  const done = all.filter((r) => r.resolved_at)
  const sources = [...new Set(all.map((r) => r.source || 'client'))]
  const shown = (showResolved ? done : open)
    .filter((r) => source === 'all' || (r.source || 'client') === source)

  return (
    <div className="space-y-6">
      {/* ---- What state is it in ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{tr('Error monitoring')}</h2>
          <p className="mt-0.5 text-sm text-smoke">
            {tr('Every crash that showed somebody the "Mayday" screen, plus any scheduled job that failed. Grouped by fault, newest first.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The source filter only draws once there is more than one kind of
              row to separate - a chip that always says "All" is furniture. */}
          {sources.length > 1 && ['all', ...sources].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={cx('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                source === s ? 'border-brand bg-brand text-white' : 'border-gray-200 text-smoke hover:border-brand hover:text-brand')}
            >
              {s === 'all' ? tr('All') : tr(SOURCE_LABEL[s] || s)}
            </button>
          ))}
          {/* TWO SEGMENTS, NOT ONE BUTTON THAT SAYS THE OPPOSITE OF WHERE YOU
              ARE (9 Sep 2026). Ethan: "it isn't showing the past ones that have
              been fixed, like an archive with the ones that have been fixed."

              The archive was built and reachable - through a single button
              whose label was the state you were NOT in. Sitting on the open
              list it read "Fixed (0)", which is a status if you have not
              already worked out that it is a switch, and it says the archive is
              empty at the same moment as offering to show it to you. Two
              segments say where you are AND where you can go, both counts are
              visible at once, and the picked one is solid brand with white on
              it like every other picked thing on this platform. */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5">
            {[
              { key: false, label: tr('Open'), count: open.length },
              { key: true, label: tr('Fixed'), count: done.length },
            ].map((seg) => (
              <button
                key={String(seg.key)}
                type="button"
                onClick={() => { setShowResolved(seg.key); setOpenRow(null) }}
                aria-pressed={showResolved === seg.key}
                className={cx('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  showResolved === seg.key ? 'bg-brand text-white' : 'text-smoke hover:text-brand')}
              >
                {seg.label} ({seg.count})
              </button>
            ))}
          </div>
          <button type="button" onClick={load} className="btn-secondary !py-1.5 text-xs">
            <Icon name="reorder" className="h-4 w-4" /> {tr('Refresh')}
          </button>
        </div>
      </div>

      {/* ---- HOW TO GET INTO SENTRY, WRITTEN DOWN WHERE IT IS NEEDED ----
          Ethan: "I tried to login and check Sentry but I was having
          difficulties logging in, it's weird, it seems like a different login
          screen or something."
          It is a different login screen. This project's DSN ends
          `ingest.de.sentry.io`, so the organisation is on Sentry's EU
          instance, and the EU and US instances are separate installations with
          separate account databases - signing in at plain sentry.io is signing
          in somewhere the account does not exist. That fact lived in one
          character of a URL inside a source file. It lives here now, next to
          the panel that sends people there. */}
      <details className="rounded-card border border-gray-100 bg-cloud/40 px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-smoke">{tr('Signing in to Sentry')}</summary>
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink/75">
          <p>
            {tr('This project is on Sentry’s EU instance, which is a separate installation from the one at sentry.io - that is why the login there does not recognise the account.')}
          </p>
          <p>
            <span className="font-semibold">{tr('Sign in at')} </span>
            <a href={sentryHome()} target="_blank" rel="noreferrer noopener" className="font-mono font-semibold text-brand hover:underline">{sentryHome()}</a>
            {' '}{tr('with the email the Sentry account was created under, then Forgot password if you are not sure of it.')}
          </p>
          <p>
            {tr('The project to open is id')} <code className="rounded bg-white px-1.5 py-0.5 font-mono">{sentryProjectId()}</code>{' '}
            {tr('under organisation')} <code className="rounded bg-white px-1.5 py-0.5 font-mono">o4512044607733760</code>.
          </p>
          <p className="text-smoke">
            {tr('Stack traces in Sentry are minified for the same reason they are here: source maps are not being uploaded at build time, which needs a Sentry auth token in the Vercel environment. Until then this panel’s context and trail are the better read.')}
          </p>
        </div>
      </details>

      {!rows && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}</div>}

      {rows && shown.length === 0 && (
        <div className="flex items-center gap-3 rounded-card border border-green-200 bg-green-50 px-5 py-4">
          <Icon name="check" className="h-5 w-5 shrink-0 text-green-700" />
          <p className="text-sm font-medium text-green-800">
            {showResolved
              ? tr('Nothing has been ticked off yet.')
              : tr('Nothing is broken. This is the state you want it in.')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((r) => {
          const expanded = openRow === r.fingerprint
          return (
            <div
              key={r.fingerprint}
              className={cx(
                'overflow-hidden rounded-card border transition-colors',
                // MORE THAN ONE PERSON IS A DIFFERENT PROBLEM FROM ONE PERSON,
                // and it is the only distinction on this list worth a colour:
                // one is a bug, the other is often one creator's extension or a
                // stale tab. A scheduled job has no "people" at all, so it is
                // judged on being unresolved instead.
                r.people > 1 || (r.source && r.source !== 'client' && !r.resolved_at)
                  ? 'border-red-200 bg-red-50/40'
                  : 'border-gray-100 bg-white',
              )}
            >
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setOpenRow(expanded ? null : r.fingerprint)}
                  aria-expanded={expanded}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="flex items-center gap-2">
                    <Icon
                      name="chevronRight"
                      className={cx('h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform', expanded && 'rotate-90')}
                    />
                    <span className="min-w-0 truncate text-sm font-semibold">{r.message}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[22px] text-xs text-smoke">
                    <code className="rounded bg-cloud px-1.5 py-0.5">{r.route || '/'}</code>
                    {r.source && r.source !== 'client' && (
                      <span className="rounded-full bg-ink/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/70">
                        {tr(SOURCE_LABEL[r.source] || r.source)}
                      </span>
                    )}
                    <span>{tr('last')} {timeAgo(r.last_seen_at)}</span>
                    {r.agent && <span className="truncate">· {r.agent}</span>}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-4 pl-[22px] sm:pl-0">
                  {/* A scheduled job has no people; printing "0 people" about a
                      cron failure is a number that means nothing. */}
                  {(r.source || 'client') === 'client' && (
                    <span className="text-center">
                      <span className="block text-sm font-bold tabular-nums">{r.people}</span>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {r.people === 1 ? tr('person') : tr('people')}
                      </span>
                    </span>
                  )}
                  <span className="text-center">
                    <span className="block text-sm font-bold tabular-nums">{r.hits}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tr('times')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => resolve(r, !r.resolved_at)}
                    className={cx('!py-2 !px-3 text-xs', r.resolved_at ? 'btn-secondary' : 'btn-primary')}
                  >
                    {r.resolved_at ? tr('Reopen') : tr('Mark fixed')}
                  </button>
                </div>
              </div>

              {/* ---- WHAT IT IS AND HOW TO GET IT TO HAPPEN AGAIN ---- */}
              {expanded && (() => {
                const { frames, ctx } = splitDetail(r.detail)
                const guide = explain(r)
                return (
                <div className="border-t border-gray-100 bg-white/70 px-4 py-4">
                  {/* THE EXPLANATION LEADS, BECAUSE IT IS THE ANSWER.
                      Everything else on this panel is evidence, and evidence is
                      only worth reading once you know what you are looking for.
                      Ethan: "I'm not sure what these errors are, the information
                      provided doesn't really help me." See lib/errorGuide - a
                      fault with no entry gets no explanation rather than a
                      guess, because a confident wrong answer on a monitoring
                      panel sends somebody looking in the wrong place. */}
                  {guide ? (
                    <div className="mb-4 rounded-card border border-brand/20 bg-brand-tint/30 p-4">
                      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-brand">
                        <Icon name="bulb" className="h-3.5 w-3.5" />
                        {tr('What this is')}
                        <span className="rounded-full bg-white/70 px-2 py-0.5 normal-case tracking-normal text-brand/80">{guide.severity}</span>
                      </p>
                      <p className="mt-2 text-sm font-semibold text-ink">{guide.means}</p>
                      <p className="mt-2 text-xs leading-relaxed text-ink/75">
                        <span className="font-semibold">{tr('Usually caused by')}: </span>{guide.cause}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-ink/75">
                        <span className="font-semibold">{tr('What to do')}: </span>{guide.todo}
                      </p>
                    </div>
                  ) : (
                    <p className="mb-4 rounded-card border border-gray-100 bg-cloud/50 p-3 text-xs text-smoke">
                      {tr('No known explanation for this one yet. The trail below is the best starting point: it says which screens they opened and what they pressed, in order.')}
                    </p>
                  )}

                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Fact label={tr('Where')} value={r.route || '/'} mono />
                    <Fact label={tr('Browser')} value={r.agent} mono />
                    <Fact label={tr('Screen')} value={ctx?.viewport} mono />
                    <Fact label={tr('Installed app')} value={ctx ? (ctx.installed ? 'Yes' : 'No, a browser tab') : null} />
                    <Fact label={tr('Online')} value={ctx?.online === false ? 'No, offline' : ctx?.online === true ? 'Yes' : null} />
                    <Fact label={tr('How long the app had been open')} value={ctx?.pageAge} />
                    <Fact label={tr('Language')} value={ctx?.lang} mono />
                    <Fact label={tr('Reduced motion')} value={ctx?.reduceMotion ? 'On' : null} />
                    <Fact label={tr('First seen')} value={r.first_seen_at ? formatDateTimeTz(r.first_seen_at) : null} />
                    <Fact label={tr('Last seen')} value={r.last_seen_at ? formatDateTimeTz(r.last_seen_at) : null} />
                    <Fact label={tr('Build')} value={r.release ? r.release.slice(0, 7) : null} mono />
                    <Fact label={tr('Fingerprint')} value={r.fingerprint?.slice(0, 12)} mono />
                  </dl>

                  {/* WHAT THEY WERE DOING, AND IT IS THE MOST USEFUL THING HERE.
                      A production stack is minified to `Fa@ui-BaIenqY-.js:4:29678`
                      and names nothing. A list of the screens they opened and
                      the buttons they pressed does not minify, and it is a
                      reproduction rather than a riddle. See lib/breadcrumbs -
                      it records labels we wrote and never anything anybody
                      typed. Rows from before 12 Sep 2026 have no trail. */}
                  {ctx?.trail?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tr('What they did, in order')}</p>
                      <ol className="mt-1.5 space-y-1">
                        {ctx.trail.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs text-ink/80">
                            <span className="w-4 shrink-0 text-right tabular-nums text-gray-300">{i + 1}</span>
                            <span className="min-w-0 break-words font-mono">{step}</span>
                          </li>
                        ))}
                        <li className="flex gap-2 text-xs font-semibold text-red-700">
                          <span className="w-4 shrink-0 text-right tabular-nums text-red-300">×</span>
                          <span>{tr('crashed')}</span>
                        </li>
                      </ol>
                    </div>
                  )}

                  {ctx?.reason && (
                    <div className="mt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tr('What the failure itself said')}</p>
                      <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        {Object.entries(ctx.reason).map(([k, v]) => <Fact key={k} label={k} value={String(v)} mono />)}
                      </dl>
                    </div>
                  )}

                  {frames && <Trace label={tr('Stack (minified - names are from the built bundle)')} body={frames} />}
                  {r.component && <Trace label={tr('Component tree (minified)')} body={r.component} />}

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3 text-xs text-smoke">
                    <span>
                      {tr('To reproduce: open')} <code className="rounded bg-cloud px-1.5 py-0.5">{r.route || '/'}</code>
                      {r.agent ? ` ${tr('on')} ${r.agent}` : ''}
                      {ctx?.viewport ? ` ${tr('at')} ${ctx.viewport}` : ''}.
                    </span>
                    {/* EVERYTHING ABOUT THIS ROW, ON THE CLIPBOARD. The point of
                        the button is that Ethan can paste one block into a
                        message and have the whole fault travel with it -
                        message, route, browser, context, trail and frames -
                        instead of screenshotting a panel four times. */}
                    <button type="button" onClick={() => copyReport(r, ctx, frames, guide)} className="font-semibold text-brand hover:underline">
                      {tr('Copy the whole report')}
                    </button>
                    {/* THIS LINK USED TO GO TO SOMEBODY ELSE'S SENTRY.
                        It was hard-coded to `/organizations/sentry/issues/` -
                        `sentry` being Sentry's OWN org slug, not ours - so
                        every press landed on a login for an account nobody
                        here has. Ethan: "I tried to login and check Sentry but
                        I was having difficulties logging in, it's weird, it
                        seems like a different login screen or something." That
                        is exactly what that link produces.

                        AND THIS PROJECT IS ON SENTRY'S EU REGION, which the
                        DSN says plainly (`...ingest.de.sentry.io/...`) and
                        which is the other half of the same confusion: an EU
                        account signing in at sentry.io is signing in to the US
                        instance, where the account does not exist. `sentryHome`
                        builds the right host from the DSN rather than from a
                        constant somebody has to remember. */}
                    <a
                      href={sentryLink(r.message)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-semibold text-brand hover:underline"
                    >
                      {tr('Open in Sentry')} ↗
                    </a>
                  </div>
                </div>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The stored `detail` is the stack, then a marker, then a JSON blob of what the
// app looked like and what the person had just done. One text column carries
// both because `client_errors` has no jsonb field for it and adding one is a
// migration; the two ends agree on the marker. See `buildDetail` in
// lib/monitoring.
//
// A row written before 12 Sep 2026 has no marker and is all stack, which this
// handles by simply returning it - the panel then draws no context section
// rather than an empty one.
export function splitDetail(detail) {
  const text = String(detail || '')
  const i = text.indexOf(CONTEXT_MARK)
  if (i === -1) return { frames: text, ctx: null }
  const frames = text.slice(0, i)
  try {
    return { frames, ctx: JSON.parse(text.slice(i + CONTEXT_MARK.length)) }
  } catch {
    // A truncated blob is not a reason to lose the frames.
    return { frames, ctx: null }
  }
}

/** The whole fault as one pasteable block. */
function copyReport(r, ctx, frames, guide) {
  const lines = [
    `${r.message}`,
    `route: ${r.route || '/'}`,
    `browser: ${r.agent || 'unknown'}`,
    `seen: ${r.hits} time(s), ${r.people} person/people`,
    `first: ${r.first_seen_at}  last: ${r.last_seen_at}`,
    `build: ${r.release || 'unknown'}  fingerprint: ${r.fingerprint}`,
  ]
  if (guide) lines.push('', `likely: ${guide.means}`, `cause: ${guide.cause}`)
  if (ctx) {
    lines.push('', 'context:', JSON.stringify({ ...ctx, trail: undefined }, null, 1))
    if (ctx.trail?.length) lines.push('', 'what they did:', ...ctx.trail.map((s, i) => `  ${i + 1}. ${s}`), '  x. crashed')
  }
  if (frames) lines.push('', 'stack:', frames)
  if (r.component) lines.push('', 'component tree:', r.component)
  navigator.clipboard?.writeText(lines.join('\n')).then(
    () => toastSuccess('Report copied.'),
    () => {},
  )
}

function Fact({ label, value, mono }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={cx('mt-0.5 break-words text-xs text-ink', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

// A stack has to be readable AND must not take over the page, so it scrolls
// inside its own box rather than being clamped - a truncated stack trace is
// worse than none, because the frame you need is usually the one cut off.
function Trace({ label, body }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <pre className="mt-1 max-h-52 overflow-auto rounded-xl bg-cloud/70 p-3 text-[11px] leading-relaxed text-ink/80">
        {body}
      </pre>
    </div>
  )
}
