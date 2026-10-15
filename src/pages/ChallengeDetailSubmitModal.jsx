import { useEffect, useRef } from 'react'
import { Modal, Spinner } from '../components/ui'
import { detectPlatform, cx } from '../lib/utils'
import Icon from '../components/Icon'
import { TLine } from '../components/TranslatedText'

// Part of ChallengeDetail.jsx: every value it shows comes in as a prop from the page.
export default function ChallengeDetailSubmitModal({
  caption,
  claiming,
  dupInfo,
  errorField,
  linkMeta,
  normaliseUrl,
  openBonusRules,
  setCaption,
  setCaptionTouched,
  setClaiming,
  setDupInfo,
  setErrorField,
  setShowSubmit,
  setSubmitError,
  setVideoUrl,
  showSubmit,
  submitEntry,
  submitError,
  submitting,
  tr,
  urlProblem,
  videoUrl,
}) {
  // A "this video is already in" notice lands in the scrolling body, which may be scrolled away from it: bring it in.
  const dupRef = useRef(null)
  useEffect(() => { if (dupInfo) dupRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [dupInfo])
  // THE BUTTON IS PINNED, NOT AT THE END OF THE FORM (15 Oct 2026). On a phone with the keyboard up the form ran past
  // the screen, so posting meant scrolling a sheet that shook as it moved, and a creator could not get his entry in.
  // The sheet's footer holds the button (and any error) where a thumb can always reach it; the form above is compact
  // enough that nothing needs scrolling but the caption box itself.
  const footer = (
    <div className="space-y-2.5">
      {submitError && (
        <div id="submit-error" role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}
      <button type="submit" form="submit-entry-form" disabled={submitting} className="btn-primary w-full justify-center !py-3.5 text-base shadow-card">
        {submitting ? <Spinner /> : <><Icon name="video" className="h-5 w-5" /> {tr('Enter the challenge')}</>}
      </button>
    </div>
  )
  return (
    <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title={tr("Submit your entry")} footer={footer}>
      <form id="submit-entry-form" onSubmit={submitEntry} noValidate className="space-y-3.5">
        {/* THE SUBMIT FORM, REDRAWN. Numbered steps, a link box with its own Paste button, and bonus rows that turn
            solid brand when ticked - the platform's one rule for a picked option - instead of the browser's own tick
            box. */}
        <div>
          <label htmlFor="video_url" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">1</span>
            {tr("Your video link")}
          </label>
          <div className={cx(
            // `field-shell`: the BOX shows focus, not the input inside it. Without it the input drew its own 1px orange
            // ring inside the box, the "weird orange lines" the team saw.
            'field-shell flex items-center gap-2 rounded-xl border bg-white pl-3 pr-1.5 transition-all duration-200 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15',
            errorField === 'url' ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200',
          )}>
            <Icon name="link" className="h-4 w-4 shrink-0 text-smoke" />
            <input
              id="video_url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errorField === 'url'}
              aria-describedby={submitError ? 'submit-error' : undefined}
              className="no-ios-zoom min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-smoke"
              placeholder={tr("tiktok.com/@you/video/…")}
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value)
                if (errorField === 'url') { setSubmitError(''); setErrorField(''); setDupInfo(null) }
              }}
            />
            {!videoUrl.trim() && typeof navigator !== 'undefined' && navigator.clipboard?.readText && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = (await navigator.clipboard.readText()).trim()
                    if (text) setVideoUrl(text)
                  } catch { /* permission refused: they can still type */ }
                }}
                className="shrink-0 rounded-lg bg-brand-tint px-3 py-1.5 text-xs font-bold text-brand transition-transform duration-200 active:scale-95"
              >
                {tr("Paste")}
              </button>
            )}
          </div>
          {/* WHAT WE FOUND AT THE END OF THE LINK. It replaces a line that
              said "Detected platform: TikTok" - which is a fact about our
              parsing rather than about their video, and which they could
              already see from the link they had just pasted. A cover and
              their own handle is the same reassurance made of the thing they
              actually care about: that we found the right post. */}
          {videoUrl.trim() && !urlProblem(videoUrl) && (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-gray-100 bg-cloud/50 p-2">
              <div className="h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-black/5">
                {linkMeta?.thumbnail
                  ? <img src={linkMeta.thumbnail} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  : (
                    <span className="flex h-full w-full items-center justify-center">
                      {linkMeta?.loading
                        ? <Spinner className="h-4 w-4" />
                        : <Icon name="video" className="h-5 w-5 text-gray-300" />}
                    </span>
                  )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink">
                  {detectPlatform(normaliseUrl(videoUrl))}
                  {linkMeta?.handle && <span className="ml-1.5 font-medium text-brand">@{linkMeta.handle}</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-smoke">
                  {linkMeta?.loading
                    ? tr('Reading your post…')
                    : linkMeta?.thumbnail
                      ? tr('Found it. Check the caption below and post your entry.')
                      : tr('We could not read a preview. Your entry still counts.')}
                </p>
              </div>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="caption" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">2</span>
            {tr("Caption")}
          </label>
          {/* A fixed height that scrolls inside itself: a long caption never makes the sheet grow past the screen. */}
          <textarea
            id="caption"
            rows={3}
            style={{ height: '5rem' }}
            aria-invalid={errorField === 'caption'}
            aria-describedby={submitError ? 'submit-error' : undefined}
            className={cx('input no-ios-zoom resize-none overflow-y-auto overscroll-contain', errorField === 'caption' && '!border-red-300 !ring-2 !ring-red-100')}
            placeholder={tr("The caption you used, or a note for the team…")}
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value)
              setCaptionTouched(true)
              if (errorField === 'caption') { setSubmitError(''); setErrorField('') }
            }}
          />
        </div>
        {/* ---- THE BONUSES THIS VIDEO MIGHT HAVE EARNED ---- Only bonuses the admin wrote a QUESTION for appear here -
             see migration 155 and the prompt field in PointRulesEditor. A bonus with no question is still awarded by an
             admin by hand, exactly as bonuses have always worked. The points are stated on every line. A tick box that
             does not say what it is worth is a tick box people leave alone. */}
        {openBonusRules.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white"><Icon name="star" className="h-3.5 w-3.5" /></span>
              {tr("Bonus points")}
            </p>
            <p className="mb-3 pl-8 text-xs text-smoke">
              {tr("Tick anything this video qualifies for. The team can see what you ticked next to the video.")}
            </p>
            <div className="space-y-2">
              {openBonusRules.map((r) => {
                const on = claiming.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setClaiming((cur) => (on ? cur.filter((x) => x !== r.id) : [...cur, r.id]))}
                    className={cx(
                      'flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 active:scale-[0.99]',
                      on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-ink hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40',
                    )}
                  >
                    <span className={cx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-200',
                      on ? 'border-white bg-white text-brand' : 'border-gray-300 bg-white text-transparent',
                    )}>
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      <TLine text={r.prompt} />
                      {r.min_views > 0 && (
                        <span className={cx('mt-0.5 block text-[11px] font-medium', on ? 'text-white/80' : 'text-smoke')}>
                          {tr("The bonus lands once this video passes {n} views.", { n: Number(r.min_views).toLocaleString() })}
                        </span>
                      )}
                    </span>
                    <span className={cx(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold',
                      on ? 'bg-white text-brand' : 'bg-brand text-white',
                    )}>
                      +{r.points}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {dupInfo && (
          <div ref={dupRef} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">{tr('This video has already been submitted')}</p>
                <p className="mt-1 leading-relaxed text-amber-900/85">
                  {dupInfo.same
                    ? tr('It is already in {c}, which is this challenge.', { c: dupInfo.title || tr('this challenge') })
                    : tr('It is already in {c}. A video can only count in one challenge.', { c: dupInfo.title || tr('another challenge') })}
                </p>
                {!dupInfo.same && (
                  <p className="mt-1.5 leading-relaxed text-amber-900/85">
                    {tr('Meant it for this one? Remove it from {c} first, then submit it here. If that challenge has finished, message the team.', { c: dupInfo.title || tr('the other challenge') })}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
