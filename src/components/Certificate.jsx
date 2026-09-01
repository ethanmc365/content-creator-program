import { formatDate } from '../lib/utils'
import { useT } from '../lib/i18n'

// SOMETHING TO SHOW OFF WITH.
//
// A £10 voucher is a line in a rewards table, which is a receipt - it is not a
// thing anybody posts. The same fact, on a certificate with their name on it,
// is. Creators put these on their stories and it costs the programme nothing,
// which is the whole idea.
//
// Fixed 900x620 so it photographs identically on every device (see
// lib/domSnapshot.js); a picture has no viewport to be responsive to.
export const CERTIFICATE_W = 900
export const CERTIFICATE_H = 620

const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd' }
const place = (rank) => ORDINAL[rank] || (rank ? `${rank}th` : null)

/**
 * @param name      the creator's name
 * @param prize     "£10 Tryp.com voucher" - what they earned, in words
 * @param challenge the challenge title
 * @param rank      their finishing place, if they placed
 * @param views     their final views, if known
 * @param date      when it was awarded
 */
export default function Certificate({
  cardRef, name, prize, challenge, rank = null, views = null, date = null,
}) {
  const tr = useT()
  const placed = place(rank)
  return (
    <div
      ref={cardRef}
      style={{ width: CERTIFICATE_W, height: CERTIFICATE_H, fontFamily: 'Poppins, system-ui, sans-serif' }}
      className="relative overflow-hidden bg-white"
    >
      {/* The frame. Two rules rather than a border, so the corners stay square
          against the wash behind them. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#fff8f4 0%,#ffffff 45%,#fdf1eb 100%)' }} />
      <div className="absolute inset-5 rounded-[18px] border-2 border-brand/25" />
      <div className="absolute inset-[26px] rounded-[12px] border border-brand/10" />

      <div className="relative flex h-full flex-col items-center justify-center px-20 text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.42em] text-brand">{tr("Tryp.com Creator Community")}</p>

        <div className="mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden>
            <path d="M8 21h8M12 17v4M17 4h3v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V4h3M7 4h10v4a5 5 0 0 1-10 0V4z" />
          </svg>
        </div>

        <p className="mt-6 text-[40px] font-extrabold leading-none tracking-tight text-ink">
          {placed ? 'Certificate of Achievement' : 'Certificate of Participation'}
        </p>

        <div className="my-6 h-px w-24 bg-brand/30" />

        <p className="text-[15px] font-medium text-smoke">{tr("This certifies that")}</p>
        <p className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight text-brand">{name || 'Creator'}</p>

        <p className="mt-5 max-w-[640px] text-[19px] font-semibold leading-relaxed text-ink">
          {placed ? `finished ${placed} and earned ` : 'took part and earned '}
          <span className="text-brand">{prize}</span>
        </p>
        <p className="mt-1 max-w-[640px] text-[17px] font-medium text-smoke">in the {challenge || 'Tryp.com Creative Challenge'}</p>

        <div className="mt-9 flex items-center gap-8 text-[13px] font-semibold uppercase tracking-wider text-smoke">
          {views != null && (
            <span className="tabular-nums">{Number(views).toLocaleString()} views</span>
          )}
          {views != null && date && <span className="h-1 w-1 rounded-full bg-smoke/40" />}
          {date && <span>{formatDate(date)}</span>}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-2" style={{ background: 'linear-gradient(90deg,#d94407,#f5853f)' }} />
    </div>
  )
}
