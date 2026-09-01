import { Avatar, Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { cx } from '../../../lib/utils'
import { metaFor } from '../../../lib/notifications'

// THE REAL THINGS, DRAWN WITH INVENTED DATA.
//
// The rule for this whole file: if the platform sends it, posts it or shows it,
// what appears in the Testing Centre has to be THE SAME ARTEFACT, not a
// description of one. The email lab used to render a paragraph explaining why
// the birthday card is not an email, inside an email frame. That is a note to
// the reader wearing the costume of the thing it is describing, and in a demo
// it reads as the product.
//
// So: the email shell here is a faithful port of the real one from
// supabase/functions/_shared/emailTemplate.ts, the birthday card is the real
// card's markup, and the notification row is what the bell actually draws.

const FONT = "'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/**
 * ONE BRANDED SHELL FOR EVERY EMAIL, ported exactly.
 *
 * The original is built from tables with inline styles, because Outlook still
 * renders with Word and Gmail strips <style> blocks. This is the same design
 * expressed in the way a browser prefers, which is honest: what a creator
 * receives is these colours, this order, this wordmark, this footer.
 *
 * The wordmark is TEXT and not the logo PNG, exactly as in the real template -
 * most mail clients block remote images by default, so a logo would be an empty
 * box for half the recipients.
 */
export function RealEmail({ to, subject, title, children, cta, footerNote, attachment }) {
  return (
    <div className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-card">
      {/* The client's own chrome, so it is obvious this is a received message
          rather than a page on the platform. */}
      <div className="space-y-1 border-b border-gray-100 bg-cloud/70 px-5 py-3.5">
        <Head label="From" value="Tryp.com Creator Community <team@mail.tryp.com>" />
        <Head label="To" value={to} />
        <Head label="Subject" value={subject} bold />
        {attachment && (
          <p className="flex items-center gap-1.5 pt-1 text-[11px] text-smoke">
            <Icon name="link" className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span className="truncate font-medium">{attachment}</span>
          </p>
        )}
      </div>

      {/* From here down is the real template. */}
      <div className="bg-[#f6f6f7] p-4 sm:p-6" style={{ fontFamily: FONT }}>
        <div className="mx-auto max-w-[600px] overflow-hidden rounded-2xl border border-[#ececee] bg-white">
          <div className="bg-brand px-8 py-6">
            <p className="text-[26px] font-extrabold leading-none tracking-tight text-white">
              TRYP<span className="text-sm font-bold">.com</span>
            </p>
            <p className="mt-[7px] text-xs font-semibold leading-none tracking-wide text-white/85">
              Content Creator Community
            </p>
          </div>

          <div className="px-8 py-8">
            <h1 className="mb-[18px] text-[22px] font-bold leading-tight text-ink">{title}</h1>
            <div className="space-y-4 text-[15px] leading-relaxed text-ink">{children}</div>
            {cta && (
              <p className="mb-2 mt-7">
                <span className="inline-block rounded-full bg-brand px-7 py-3 text-[15px] font-semibold text-white">
                  {cta}
                </span>
              </p>
            )}
          </div>

          <div className="border-t border-[#f1f1f2] px-8 pb-7 pt-5">
            {footerNote && <p className="mb-2.5 text-xs leading-relaxed text-smoke">{footerNote}</p>}
            <p className="text-xs leading-relaxed text-smoke">
              Tryp.com Content Creator Community ·{' '}
              <span className="text-brand underline">Email preferences</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Head({ label, value, bold }) {
  return (
    <p className="flex gap-2 text-[11px]">
      <span className="w-14 shrink-0 text-smoke">{label}</span>
      <span className={cx('min-w-0 flex-1 truncate', bold ? 'font-semibold text-ink' : 'text-ink')}>{value}</span>
    </p>
  )
}

/**
 * THE BIRTHDAY CARD, as it is actually posted.
 *
 * Not an email and never was: a scheduled job at 07:00 posts this into the room
 * as a message, so forty people can reply under it. This is the real card's
 * markup with a fixture in place of the profile fetch.
 */
export function DemoBirthdayCard({ creator }) {
  const first = creator.name?.split(' ')[0] || creator.name
  return (
    <div className="mt-1 w-72 max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-white text-center shadow-card sm:w-80">
      <div className="relative bg-gradient-to-br from-brand to-brand-light px-4 py-5 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">🎉 It&apos;s a birthday!</p>
        <div className="my-3 flex justify-center">
          <div className="rounded-full bg-white/30 p-1">
            <Avatar src={null} name={creator.name} size="lg" />
          </div>
        </div>
        <p className="text-lg font-extrabold leading-tight">Happy birthday, {first}! 🎂</p>
      </div>
      <div className="p-4 text-center">
        <p className="text-sm text-smoke">
          It&apos;s <span className="font-semibold text-brand">{creator.name}</span>&apos;s birthday today.
          Drop a message below and help us wish them a brilliant one!
        </p>
      </div>
    </div>
  )
}

/** A message in a room, so a card can be shown where it actually lands. */
export function DemoMessage({ author, when = 'now', children }) {
  return (
    <div className="flex gap-3">
      <Avatar src={null} name={author} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{author}</span>
          <Badge tone="light" className="!px-2 !py-0.5 !text-[10px]">Tryp.com Team</Badge>
          <span className="text-[11px] text-smoke">{when}</span>
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}

/**
 * A NOTIFICATION, as the bell draws it. The icon and the label come from
 * `TYPE_META` - the same table the real list reads, so a type missing from it
 * shows here exactly as wrongly as it would in the app.
 */
export function DemoNotification({ type, title, body, when, unread = true }) {
  const meta = metaFor(type)
  return (
    <div className={cx('flex gap-3 rounded-card px-4 py-3', unread ? 'bg-brand-tint/40' : 'bg-white')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-card">
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
        </p>
        <p className="mt-0.5 truncate text-xs text-smoke">{body}</p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {meta.label} · {when}
        </p>
      </div>
    </div>
  )
}

/** A push notification on a lock screen, which is where most of them are read. */
export function DemoPush({ title, body, when = 'now' }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[22px] bg-gradient-to-br from-gray-700 to-gray-900 p-3 shadow-lift">
      <div className="flex gap-3 rounded-2xl bg-white/95 px-3.5 py-3 backdrop-blur">
        <img src="/apple-touch-icon-v4.png" alt="" className="h-9 w-9 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px] font-bold uppercase tracking-wide text-smoke">Tryp.com</span>
            <span className="shrink-0 text-[10px] text-smoke">{when}</span>
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-ink">{title}</p>
          <p className="text-xs leading-snug text-smoke">{body}</p>
        </div>
      </div>
    </div>
  )
}

/** The screen a pending applicant sees. The real one is TrypPlaneScene. */
export function DemoReviewPending({ name }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-cloud/50 px-6 py-10 text-center">
      <img src="/brand/tryp-plane-cutout.png" alt="" className="h-14 w-auto opacity-90" />
      <div className="max-w-sm space-y-2">
        <h3 className="text-lg font-bold">Thanks, {name.split(' ')[0]}! Your application is on its way</h3>
        <p className="text-xs leading-relaxed text-smoke">
          It&apos;s heading to the Tryp.com Team and will be reviewed shortly. We&apos;ll notify you by
          email soon, so keep an eye on your inbox and check back here shortly.
        </p>
      </div>
    </div>
  )
}
