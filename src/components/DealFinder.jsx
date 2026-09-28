import { useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { useAuth } from '../context/AuthContext'
import { useT } from '../lib/i18n'
import { cx } from '../lib/utils'
import { TRIP_KINDS, trypHome, trypLocale, trypTrips } from '../lib/trypSite'

// "FIND A DEAL" (26 Sep 2026).
//
// Ethan, from a creator's suggestion: "we should have a link directly to the
// Tryp.com website that's going to show the best deals ... creators are
// struggling with finding the best deals ... We could also provide info like
// how to get the best deals, like click filter, click lowest price search, or a
// bit about our multi-city trips or flight and hotels."
//
// A button beside "Hook me up" (the two things you need before you film: a
// line to open on and a price to show), opening a sheet with tryp.com in the
// creator's own language, its ready-made deal lists, and a short how-to.
// Every link is a plain external <a target="_blank">: a laptop opens a new tab,
// a phone hands it to the browser (or Safari's in-app view from the installed
// app), and nothing here depends on JavaScript to open it.
//
// COPY IS A FIRST DRAFT - Ethan will send wording changes.

// COPY CHANGES, 28 Sep 2026 (Ethan): "screenshot the trip or record their
// laptop screen ... just to show the actual website", and a new step for when
// the first page of results is thin: Tryp.com's own "Create more trips" button
// at the foot of the results keeps searching and lifts the best to the top.
const TIPS = [
  { icon: 'magnifier', title: 'Search with flexible dates', body: 'Pick your home airport and try a few dates either side. The same trip can halve in price a week later.' },
  { icon: 'money', title: 'Sort by lowest price', body: 'Open the filters and sort by price, lowest first. The cheapest option is the one your viewers will stop scrolling for.' },
  { icon: 'refresh', title: 'Not finding a good one? Create more trips', body: 'Scroll to the bottom of the results and press "Create more trips". Tryp.com keeps looking for more deals and puts the best ones at the top.' },
  { icon: 'plane', title: 'Flight and hotel together', body: 'Booking both in one trip usually comes out cheaper than booking them separately. Show the total per person.' },
  { icon: 'pin', title: 'Try a multi-city trip', body: 'Two or three cities in one booking. It is the kind of trip people do not know they can get this cheaply.' },
  { icon: 'device', title: 'Capture the trip', body: 'Screenshot the trip, or screen-record your phone or laptop as you scroll through it, so viewers see the real website, the price and the dates.' },
]

export default function DealFinder({ className, variant = 'button' }) {
  const tr = useT()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = trypLocale(profile)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          variant === 'button'
            ? 'relative flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand/20 bg-white px-5 py-2.5 text-sm font-bold text-brand transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 active:scale-[0.98]'
            : '',
          className,
        )}
      >
        <Icon name="ticket" className="h-4 w-4" />
        {tr('Find a deal')}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('Find a deal to film')}>
        <div className="space-y-6">
          <a
            href={trypHome(loc)}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-4 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5"
          >
            <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-brand shadow-card">
              <Icon name="plane-tryp" className="h-6 w-6" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-lg font-bold leading-tight">{tr('Open Tryp.com')}</span>
              <span className="block text-xs text-white/85">{tr('Search flights and hotels, in your language')}</span>
            </span>
            <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
          </a>

          {/* TRIP IDEAS (renamed from "ready-made deal lists", 28 Sep 2026).
              Names are never cut off any more: icon on top, the name under it
              on up to two lines. Ethan: it said "week" for "Weekend" and
              "Chris" for "Christmas". */}
          <section>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-smoke">{tr('Browse trip ideas')}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {TRIP_KINDS.map((k, i) => (
                <a
                  key={k.kind}
                  href={trypTrips(loc, k.kind)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ animationDelay: `${120 + i * 40}ms` }}
                  className="group animate-pop-in flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-gray-100 bg-white px-2 py-3 text-center text-xs font-semibold leading-tight text-ink shadow-card transition-all duration-200 [animation-fill-mode:both] hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:text-brand"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-brand transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                    <Icon name={k.icon} className="h-4 w-4" />
                  </span>
                  <span className="[overflow-wrap:anywhere]">{tr(k.label)}</span>
                </a>
              ))}
            </div>
          </section>

          {/* THE STEPS AS A PATH (28 Sep 2026): numbered stops on a line that
              draws itself down the list as they arrive, one after another. */}
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-smoke">{tr('How to find the best deal')}</h3>
            <ol className="relative space-y-2.5">
              <span aria-hidden className="deal-path pointer-events-none absolute bottom-6 left-[1.3rem] top-6 w-0.5 origin-top rounded-full bg-gradient-to-b from-brand via-brand-light to-brand/20" />
              {TIPS.map((t, i) => (
                <li
                  key={t.title}
                  style={{ animationDelay: `${300 + i * 90}ms` }}
                  className="animate-fade-up relative flex gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-card [animation-fill-mode:both]"
                >
                  <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow-[0_0_0_4px_#fff]">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Icon name={t.icon} className="h-3.5 w-3.5 shrink-0 text-brand" />
                      {tr(t.title)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-smoke">{tr(t.body)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Modal>
    </>
  )
}
