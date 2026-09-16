import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import PortfolioDeck, { useFluidWidth } from '../components/portfolio/PortfolioDeck'
import { compactViews } from '../lib/portfolio'

// A PORTFOLIO ANYBODY CAN OPEN.
//
// Ethan: "they should have the option to share it as a link, public profile page
// at a real URL, opt-in, indexable. People viewing the link will obviously only
// be able to see the portfolio, nothing else."
//
// THIS PAGE IS OUTSIDE THE APP SHELL AND THAT IS THE POINT. No header, no tab
// bar, no avatar menu, nothing to sign into. A visitor is a brand or a friend
// who followed a link out of an Instagram bio; showing them the community's
// navigation would be showing them a door they cannot open and cannot be
// expected to care about.
//
// IT READS THROUGH ONE RPC AND TOUCHES NO TABLE. `public_portfolio` is the only
// thing anon can call, its column list is written out by hand rather than
// `p.*`, and it returns null for a portfolio that is not published. See
// migration 224 for why the column list is the security boundary.
export default function PublicPortfolio() {
  const { slug } = useParams()
  const [state, setState] = useState('loading')
  const [data, setData] = useState(null)
  const [holder, width] = useFluidWidth(280)

  useEffect(() => {
    let alive = true
    supabase.rpc('public_portfolio', { p_slug: slug }).then(({ data: row, error }) => {
      if (!alive) return
      if (error || !row) { setState('missing'); return }
      setData(row)
      setState('ready')
      // The tab title is the creator's name. A shared link that says
      // "Tryp.com Creator Community" in the tab is somebody else's page as far
      // as the person who opened it is concerned.
      document.title = `${row.creator?.name || 'Creator'} — Portfolio`
    })
    return () => { alive = false }
  }, [slug])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cloud/40">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (state === 'missing') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cloud/40 px-6 text-center">
        <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-14 w-14 rounded-xl" />
        <h1 className="text-xl font-bold text-ink">This portfolio is not here</h1>
        <p className="max-w-sm text-sm text-smoke">
          It may have been unpublished, or the address may be wrong. Nothing has gone missing from
          the creator&apos;s own account.
        </p>
        <a href="https://tryp.com" className="btn-secondary mt-2">Go to Tryp.com</a>
      </div>
    )
  }

  const { creator, portfolio, videos, certificates, stats } = data

  return (
    <div className="min-h-screen bg-cloud/40 pb-16">
      {/* A thin band rather than the app header: it says where this came from
          and it does not pretend to be navigation. */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{creator?.name}</p>
            <p className="truncate text-[11px] text-smoke">Tryp.com Content Creator Community</p>
          </div>
          {stats?.views > 0 && (
            <span className="hidden shrink-0 text-right sm:block">
              <span className="block text-sm font-bold text-ink">{compactViews(stats.views)}</span>
              <span className="block text-[10px] text-smoke">views</span>
            </span>
          )}
        </div>
      </header>

      <main ref={holder} className="mx-auto max-w-5xl px-4 pt-6">
        <PortfolioDeck
          creator={creator}
          portfolio={portfolio}
          videos={videos || []}
          certificates={certificates || []}
          width={width}
        />

        {/* THE VIDEO CARDS ARE CLICKABLE, and this is where that happens.
            Ethan: "remember the video cards showing the preview on the portfolio
            should be clickable, opening the actual link."

            It is a strip UNDER the document rather than links inside the pages,
            and that is deliberate: the pages are a PDF - they are photographed
            for the export, where an anchor is a rectangle that does nothing.
            Putting the interactivity beside the paper keeps the paper honest. */}
        {videos?.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-bold text-ink">Watch them</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <a
                  key={v.id}
                  href={v.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-2.5 shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift"
                >
                  <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-cloud">
                    {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{compactViews(v.views)} views</p>
                    <p className="truncate text-[11px] capitalize text-smoke">
                      {v.platform}{v.market ? ` · ${v.market}` : ''}
                    </p>
                  </div>
                  <Icon name="link" className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-brand" />
                </a>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-10 text-center">
          <a
            href="https://tryp.com"
            className="inline-flex items-center gap-2 text-xs font-semibold text-smoke hover:text-brand"
          >
            <img src="/brand/tryp-logo.png" alt="" className="h-5 w-5 rounded" />
            Part of the Tryp.com Content Creator Community
          </a>
        </footer>
      </main>
    </div>
  )
}
