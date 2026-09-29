import { useState } from 'react'
import Icon from './Icon'
import { Spinner } from './ui'
import { copyToClipboard } from '../lib/clipboard'
import { toastSuccess } from '../lib/toast'
import { useT } from '../lib/i18n'
import { cx, formatDate, formatMoney } from '../lib/utils'

// A VOUCHER, DRAWN AS ONE (24 Sep 2026).
//
// Ethan: "enter the voucher code, which would then appear on a nice graphic like
// a ticket or voucher, just simple, matching the Tryp.com platform and style...
// whenever they've used it they can mark it as used with a button, like a tick."
//
// Two parts: the brand panel carries WHAT it is (the amount, where it came
// from), the white half carries the CODE, which is the only thing on it anybody
// will copy. A used voucher greys out and is stamped rather than removed - it
// is still a record of something earned.
//
// ONE PIECE (26 Sep 2026). Ethan: "I still want that orange card to be like
// joined onto the white card, but there to be no border around the orange
// part ... so it does look like an actual ticket rather than just the orange
// part inside." The stub now runs to the card's own edge on three sides, and
// the hairline border belongs to the white half alone.
//
// NO PERFORATION (24 Sep 2026). Ethan: "The way it's cut the little circles on
// two of the corners, I don't like that. Maybe just make it rounded, and remove
// the dotted line." The orange panel is now its own fully rounded tile, inset
// in a white card - clean, and it still reads as a voucher.
//
// A VOUCHER WITH NO CODE ON IT YET IS STILL A VOUCHER (29 Sep 2026).
//
// The ticket used to require a code to exist, and the wallet filtered on the
// same thing, so an awarded voucher whose code the team had not typed in yet
// appeared NOWHERE in the wallet - not as a placeholder, not as a line. Six of
// them were in that state in production when this was written: six creators
// told they had won a voucher, opening Rewards, and finding the voucher
// section either absent or without theirs in it.
//
// So the code is now the one part that can be missing. The stub still says
// what it is worth and where it came from, because both of those are already
// true; the white half says plainly that the code is coming. There is no
// "mark as used" on it, because there is nothing yet to spend.
//
// `onToggleUsed` is optional: an admin viewing a creator's page with `?as=`
// sees the ticket but cannot tick it for them.
export default function VoucherTicket({ reward, onToggleUsed, busy = false }) {
  const tr = useT()
  const [copied, setCopied] = useState(false)
  const code = reward.voucher_code?.trim()
  const used = !!reward.used_at
  // ISSUED BY CHAT (29 Sep 2026). Vouchers handed over before codes lived on the
  // platform have none here, and "being prepared" told a creator who already HAD
  // theirs that they were still waiting. It says what actually happened.
  const byChat = !code
  const from = reward.challenges?.title
    || (reward.milestones?.title && `${tr('Milestone')}: ${reward.milestones.title}`)
    || (reward.source === 'referral' ? tr('Referral reward') : null)

  async function copy() {
    const ok = await copyToClipboard(reward.voucher_code)
    if (ok !== false) {
      setCopied(true)
      toastSuccess(tr('Voucher code copied'))
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div
      className={cx(
        'relative flex overflow-hidden rounded-card bg-white shadow-card transition-[filter,opacity] duration-300',
        used && 'opacity-70 grayscale',
      )}
    >
      {/* The stub: what it is worth and where it came from. */}
      <div className="relative flex w-[30%] min-w-[6.5rem] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand to-brand-light p-4 text-white sm:w-[32%] sm:min-w-[7.5rem] sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-xl" />
        <p className="relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/80">
          <Icon name="ticket" className="h-3.5 w-3.5" /> {tr('Voucher')}
        </p>
        <p className="relative mt-3 text-2xl font-bold leading-none tabular-nums sm:text-3xl">
          {reward.converted ? '≈ ' : ''}{formatMoney(reward.amount, reward.currency)}
        </p>
        <p className={cx('relative mt-1.5 text-[11px] font-medium text-white/80', used && 'invisible')}>Tryp.com</p>
      </div>

      {/* The code. */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 rounded-r-card border-y border-r border-gray-100 px-3.5 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          {from && <p className="truncate text-xs text-smoke">{from}</p>}
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-smoke">
            {code ? tr('Your code') : tr('Your voucher')}
          </p>
          {reward.parts && (
            <p className="mt-0.5 text-[11px] text-smoke">
              {tr('Combined: {parts}', { parts: reward.parts.map((p) => formatMoney(p.amount, p.currency)).join(' + ') })}
            </p>
          )}
          {code ? (
            /* WRAPS, NEVER TRUNCATES: a code with its end cut off is useless.
               The whole box is the copy button - the one thing anybody does
               with a code, and a bigger target than an icon beside it. */
            <button
              type="button"
              onClick={copy}
              aria-label={tr('Copy the code')}
              className="mt-1 flex w-full items-center gap-2 rounded-lg bg-cloud px-2.5 py-2 text-left transition-transform duration-200 hoverable:hover:scale-[1.02]"
            >
              <code className="min-w-0 flex-1 [overflow-wrap:anywhere] font-mono text-sm font-bold text-ink sm:text-base sm:tracking-wider">
                {code}
              </code>
              <Icon name={copied ? 'check' : 'copy'} className="h-5 w-5 shrink-0 text-brand" />
            </button>
          ) : (
            <p className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-2.5 py-2 text-xs text-smoke">
              <Icon name="chat" className="h-4 w-4 shrink-0 text-brand" />
              {tr('Issued by chat. The code is in your messages with the team.')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-smoke">
            {used
              ? tr('Used {date}', { date: formatDate(reward.used_at) })
              : reward.distributed_at ? tr('Issued {date}', { date: formatDate(reward.distributed_at) }) : ''}
          </p>
          {onToggleUsed && (code || byChat) && (
            <button
              type="button"
              onClick={() => onToggleUsed(!used)}
              disabled={busy}
              aria-pressed={used}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-transform duration-200 hoverable:hover:scale-105',
                used ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink',
              )}
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-4 w-4" />}
              {used ? tr('Used') : tr('Mark as used')}
            </button>
          )}
        </div>
      </div>

      {used && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-5 left-5 rotate-[-8deg] rounded-md border-2 border-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-widest text-white"
        >
          {tr('Used')}
        </span>
      )}
    </div>
  )
}
