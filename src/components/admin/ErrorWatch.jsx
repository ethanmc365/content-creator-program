import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Skeleton } from '../ui'
import Icon from '../Icon'
import { cx, formatDateTimeTz, timeAgo } from '../../lib/utils'
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
          <button
            type="button"
            onClick={() => { setShowResolved((v) => !v); setOpenRow(null) }}
            className={cx('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              showResolved ? 'border-brand bg-brand text-white' : 'border-gray-200 text-smoke hover:border-brand hover:text-brand')}
          >
            {showResolved ? `${tr('Open')} (${open.length})` : `${tr('Fixed')} (${done.length})`}
          </button>
          <button type="button" onClick={load} className="btn-secondary !py-1.5 text-xs">
            <Icon name="reorder" className="h-4 w-4" /> {tr('Refresh')}
          </button>
        </div>
      </div>

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
              {expanded && (
                <div className="border-t border-gray-100 bg-white/70 px-4 py-4">
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Fact label={tr('Where')} value={r.route || '/'} mono />
                    <Fact label={tr('Browser')} value={r.agent} mono />
                    <Fact label={tr('First seen')} value={r.first_seen_at ? formatDateTimeTz(r.first_seen_at) : null} />
                    <Fact label={tr('Last seen')} value={r.last_seen_at ? formatDateTimeTz(r.last_seen_at) : null} />
                    <Fact label={tr('Build')} value={r.release ? r.release.slice(0, 7) : null} mono />
                    <Fact label={tr('Fingerprint')} value={r.fingerprint?.slice(0, 12)} mono />
                  </dl>

                  {r.detail && <Trace label={tr('Stack')} body={r.detail} />}
                  {r.component && <Trace label={tr('Component')} body={r.component} />}

                  <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3 text-xs text-smoke">
                    <span>
                      {tr('To reproduce: open')} <code className="rounded bg-cloud px-1.5 py-0.5">{r.route || '/'}</code>
                      {r.agent ? ` ${tr('on')} ${r.agent}` : ''}.
                    </span>
                    {/* Sentry keeps the breadcrumbs and the sourcemapped frames.
                        A search link rather than a deep link, because the issue
                        id is Sentry's and we do not store it. */}
                    <a
                      href={`https://sentry.io/organizations/sentry/issues/?query=${encodeURIComponent(r.message || '')}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-semibold text-brand hover:underline"
                    >
                      {tr('Open in Sentry')} ↗
                    </a>
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
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
