import Icon from '../../components/Icon'
import { DateField, TimeField } from '../../components/DateTimeFields'
import { COMMON_ZONES } from '../../lib/timezones'
import { Select } from '../../components/ui'
import RichToolbar from '../../components/RichToolbar'
import RichEditable from '../../components/RichEditable'
import { cx } from '../../lib/utils'
import SocialMark from '../../components/SocialMark'

// Part of AdminChallengeForm.jsx: every value it shows comes in as a prop from the page.
export default function AdminChallengeFormBasics({
  ALL_PLATFORMS,
  PICKED,
  SOCIAL_BRAND,
  activeEditor,
  briefRef,
  ddmmToIso,
  editing,
  form,
  isoToDdmm,
  rulesRef,
  seeded,
  set,
  togglePlatform,
  writing,
}) {
  return (
    <section className="card space-y-6 max-sm:!rounded-none max-sm:!border-x-0 max-sm:!border-b-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!pt-6 max-sm:!shadow-none">
      <h2 className="text-lg font-semibold">The basics</h2>
      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" type="text" required className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder='e.g. "Summer Escapes Challenge"' />
      </div>

      {/* WHEN IT RUNS SITS WITH WHAT IT IS CALLED.
          Dates were three sections further down, past scoring and prizes,
          which is a strange place for the second thing anybody decides. */}
      <div>
        {/* STARTS AND ENDS ARE TWO BOXES, EACH HOLDING ITS OWN DATE AND TIME (30 Sep 2026).
            Ethan, on the phone: "dates are outside boxes, some weird inconsistent jumbled
            UI." It was four loose fields in a two-column grid, so a date sat under a time
            that belonged to another date. Now "Starts" is one box with its date and its
            time side by side, "Ends" is the next, and they stack on a phone. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { key: 'start', title: 'Starts', dateStr: form.startDateStr, timeStr: form.startTimeStr, dKey: 'startDateStr', tKey: 'startTimeStr' },
            { key: 'end', title: 'Ends', dateStr: form.endDateStr, timeStr: form.endTimeStr, dKey: 'endDateStr', tKey: 'endTimeStr' },
          ].map((b) => (
            <div key={b.key} className="rounded-xl border border-gray-200 bg-cloud/40 p-3 sm:p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-smoke">
                <Icon name="calendar" className="h-3.5 w-3.5 text-brand" />{b.title}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5">
                <DateField id={`${b.key}_date`} label="Date"
                  value={ddmmToIso(b.dateStr)}
                  onChange={(iso) => set({ [b.dKey]: isoToDdmm(iso) })}
                  min={b.key === 'end' ? (ddmmToIso(form.startDateStr) || undefined) : undefined}
                  futureError={b.key === 'end' ? 'The challenge would end before it starts.' : undefined} />
                <TimeField id={`${b.key}_time`} label="Time"
                  value={b.timeStr}
                  onChange={(v) => set({ [b.tKey]: v })} />
              </div>
            </div>
          ))}
        </div>
        {/* The market's own clock, guessed and changeable. A UK challenge
            closing "at midnight" means midnight in London; the same brief in
            Spain means midnight in Madrid. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-smoke">Times are</span>
          <Select
            className="w-44"
            ariaLabel="Timezone"
            value={form.tz || 'Europe/London'}
            onChange={(v) => set({ tz: v })}
            options={COMMON_ZONES}
          />
          <span className="text-xs text-smoke">time.</span>
        </div>
      </div>

      {/* THE BRIEF IS WRITTEN, NOT CODED. Same surface as Notes and the
          library: headings, bold and bullets look like themselves, the box
          grows with what you write, and what is stored is the portable
          markdown the challenge page already renders.

          ONE TOOLBAR FOR BOTH BOXES, AND IT FOLLOWS YOU DOWN.
          Ethan: "it looks odd that it shows up heading two, heading three,
          bold, on every one - it's a strange design. I was thinking of just
          having it at the top, and then it works for both the rules and the
          brief, instead of having it twice."
          Two identical bars stacked forty lines apart is a bar you stop
          reading as a control and start reading as a border. So there is
          one, it is sticky under the app header, and it points at whichever
          box the CARET is in - which is what a formatting bar has always
          meant. `activeEditor` is literally one of the two refs; see the
          note on `writing` for why the caret and not a focus event decides
          which.

          AND H1 IS THERE NOW. Ethan: "why don't we have heading one? We
          should have heading one as well." It was always in RichToolbar's
          list and simply not asked for here, so a brief could carry an H2
          and an H3 and had no title-sized heading at all. */}
      <div>
        <div className="sticky top-[4.5rem] z-10 mb-3 flex items-center gap-2 rounded-xl bg-white/95 backdrop-blur">
          <RichToolbar
            editorRef={activeEditor}
            only={['h1', 'h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol']}
            className="!mb-0 min-w-0 flex-1"
          />
          <span className="hidden shrink-0 pr-2 text-[11px] font-medium text-smoke sm:block">
            Editing the {writing === 'rules' ? 'rules' : 'brief'}
          </span>
        </div>

        <div>
          <p className="label">Brief</p>
          <RichEditable
            ref={briefRef}
            docId={`brief-${editing || 'new'}-${seeded}`}
            initialMd={form.description || ''}
            onChangeMd={(md) => set({ description: md })}
            placeholder="What should creators make? What is the angle? What wins?"
            className="min-h-[12rem] rounded-card border border-gray-200 bg-white px-4 py-3.5 sm:px-5 sm:py-4 text-[15px] leading-relaxed focus:border-brand/40"
          />
        </div>

        <div className="mt-6">
          <p className="label">Rules</p>
          <RichEditable
            ref={rulesRef}
            docId={`rules-${editing || 'new'}-${seeded}`}
            initialMd={form.rules || ''}
            onChangeMd={(md) => set({ rules: md })}
            placeholder="One entry per platform. Tag Tryp.com in the caption."
            className="min-h-[9rem] rounded-card border border-gray-200 bg-white px-4 py-3.5 sm:px-5 sm:py-4 text-[15px] leading-relaxed focus:border-brand/40"
          />
        </div>
      </div>

      {/* PLATFORMS YOU CAN POST ON, with their marks. Four identical grey
          pills reading Instagram / TikTok / YouTube / Facebook is a list you
          read; four marks is a row you recognise. */}
      <div>
        {/* "WHO IS IT FOR" IS GONE, AND IT WAS ALWAYS ANSWERED ALREADY.
            Ethan: "the who is it for is unnecessary, because it should
            obviously be for whatever market was selected. We don't have UGC
            or VIP creator challenges yet, so just get rid of it
            altogether." The market is picked at the top of this form, in a
            section whose heading is those same four words; a second control
            offering "UGC creators" and "VIP creators" was asking about a
            distinction the platform does not draw. The column stays in the
            database and saves as `general`, so nothing that reads it breaks
            and the option can come back if those tiers ever exist.

            "WHAT KIND OF VIDEO" WENT THE SAME WAY (21 Sep 2026). Ethan: "I
            don't think it's necessary at all... just have the platforms you
            can post on." The column keeps its default so analytics still
            reads it. */}
        {/* THE REAL MARKS, IN THEIR REAL COLOURS.
            Ethan: "the grey icons - I'd like the actual colourful social
            media icons here." `PlatformBadges` draws every mark grey in a
            grey disc, which is right on a leaderboard row where four of
            them sit beside a name and wrong here, where each one IS the
            choice you are making. `SocialMark colored` is the same set of
            marks the profile already uses, in the platforms' own colours
            (and Instagram's actual gradient), so this is the app's existing
            answer rather than a fifth drawing of a TikTok note.
            THE COLOUR SURVIVES THE SELECTION. A picked pill is brand orange
            now, and a coloured mark on orange still reads - it is the mark
            that identifies the row, so draining it on the pill you have
            chosen would be exactly backwards. */}
        <p className="label">Platforms you can post on</p>
        <div className="flex flex-wrap gap-2">
          {ALL_PLATFORMS.map((p) => {
            const on = form.platforms.includes(p)
            return (
              <button
                key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={on}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5',
                  on ? PICKED : 'border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand',
                )}
              >
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full', on ? 'bg-white' : 'bg-cloud')}>
                  <SocialMark brand={SOCIAL_BRAND[p]} colored className="h-4 w-4" />
                </span>
                {p}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
