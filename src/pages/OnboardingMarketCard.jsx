import { flagFromIso } from '../lib/flags'
import Icon from '../components/Icon'
import { useT } from '../lib/i18n'
import { usePlaceNames } from '../lib/placeNames'
import ReaderText from '../components/ReaderText'

export function MarketCard({ market, country, ready }) {
  const tr = useT()
  const place = usePlaceNames()
  if (market.outcome !== 'unknown' && !ready) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-gray-200 bg-white px-4 py-3.5 text-xs text-smoke">
        <span className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-brand/30" aria-hidden />
        {tr("Working out which market you land in…")}
      </div>
    )
  }
  if (market.outcome === 'unknown') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-dashed border-gray-200 px-4 py-3.5 text-xs text-smoke">
        <Icon name="globe" className="h-4 w-4 shrink-0" />
        {tr("Pick your country and we will tell you which market you land in.")}
      </div>
    )
  }

  if (market.outcome === 'worldwide') {
    return (
      <div className="rounded-card border border-gray-200 bg-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <Icon name="globe" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{tr("Worldwide community")}</p>
            <p className="mt-1 text-xs leading-relaxed text-smoke">
              {tr('No market covers {country} yet, and that is completely fine. You are in the worldwide community with every other creator, you can enter anything open to everyone, and we will tell you the moment a market opens near you.', { country: country ? place.country(country) : tr('your country') })}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const m = market.market
  return (
    <div key={m.slug} className="onb-market rounded-card border border-gray-100 bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-xl leading-none" aria-hidden>
          {(m.country_codes || []).map(flagFromIso).join('') || '🌍'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand">{tr("Your market")}</p>
          <p className="mt-0.5 text-sm font-semibold">{m.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-smoke">
            {m.tagline ? <ReaderText text={m.tagline} /> : tr('Briefs, rooms and challenges for {name}.', { name: m.name })}
          </p>
        </div>
        <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      </div>
      {market.others.length > 0 && (
        <p className="mt-3 border-t border-brand/15 pt-3 text-xs text-smoke">
          {market.others.length === 1
            ? tr('One other market also covers {country}. The team will sort that out with you after you join.', { country: place.country(country) })
            : tr('{n} other markets also cover {country}. The team will sort that out with you after you join.', { n: market.others.length, country: place.country(country) })}
        </p>
      )}
    </div>
  )
}
