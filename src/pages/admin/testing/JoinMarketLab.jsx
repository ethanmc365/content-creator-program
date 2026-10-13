import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LabPage, Panel, Note, Choice } from './kit'
import { JoinMarketPreview } from '../../../components/network/JoinMarket'
import { useCommunity } from '../../../context/CommunityContext'
import Icon from '../../../components/Icon'
import { cx } from '../../../lib/utils'

// JOINING ANOTHER MARKET, AS A CREATOR WHO HAS JOINED AND ASKED.
//
// The demo account is in every market, so it can never see the sheet. These are the real sheet, drawn for a creator
// whose home market is UK & Ireland, in three states. Nothing here writes: sending shows the confirmation, withdrawing
// only clears the row on screen.
const find = (chapters, re) => (chapters || []).find((c) => re.test(c.name || ''))

export default function JoinMarketLab() {
  const { chapters } = useCommunity()
  const [device, setDevice] = useState('phone')
  const [now] = useState(() => Date.now())
  const uk = find(chapters, /uk|ireland/i)
  const es = find(chapters, /spain|españa/i)
  const de = find(chapters, /germany|deutsch/i)
  const pt = find(chapters, /portugal/i)
  const mine = [uk?.id].filter(Boolean)
  const ago = (d) => new Date(now - d * 864e5).toISOString()
  const asked = [
    de && { id: 'demo-de', community_id: de.id, status: 'pending', note: 'I live in Berlin half the year and post in German for a German audience.', language_level: 'fluent', ties: ['part_time', 'audience'], created_at: ago(2) },
    es && { id: 'demo-es', community_id: es.id, status: 'pending', note: '', language_level: null, ties: [], created_at: ago(5) },
    pt && { id: 'demo-pt', community_id: pt.id, status: 'declined', note: 'Would love to visit Lisbon.', decision_note: 'Thanks for asking. We cannot add you to Portugal at the moment, but you keep creating with your own market.', language_level: 'none', ties: [], created_at: ago(9) },
  ].filter(Boolean)
  const width = device === 'phone' ? 'max-w-[400px]' : 'max-w-[620px]'

  return (
    <LabPage
      title="Joining another market"
      icon="globe"
      sandbox={false}
      subtitle="The sheet a creator opens from their menu to ask for another market, as a UK & Ireland creator sees it. Nothing here is sent."
      aside={<Choice options={[{ value: 'phone', label: 'Phone' }, { value: 'desktop', label: 'Desktop' }]} value={device} onChange={setDevice} />}
    >
      {!uk ? (
        <Note icon="alert"><p>The markets have not loaded yet.</p></Note>
      ) : (
        <>
          <Panel i={0} title="First time" hint="A creator in UK & Ireland opens it from their avatar menu. Pick a market to see the three questions; press Ask to see the confirmation.">
            <div className={cx('mx-auto w-full', width)}><JoinMarketPreview key={`fresh-${device}`} mine={mine} /></div>
          </Panel>
          <Panel i={1} title="After asking" hint="The same creator a few days later: Germany waiting for the team, Spain sent before the questions existed (so it asks for the answers), Portugal declined with the standard line.">
            <div className={cx('mx-auto w-full', width)}><JoinMarketPreview key={`asked-${device}`} mine={mine} requests={asked} /></div>
          </Panel>
          <Panel i={2} title="Finishing an old request" hint="Opened from the notification &quot;Tell us more about joining Spain&quot;: Spain is already picked and the questions are waiting.">
            <div className={cx('mx-auto w-full', width)}><JoinMarketPreview key={`finish-${device}`} mine={mine} requests={asked} initial={es?.id || null} /></div>
          </Panel>
          <Note icon="users">
            <p>
              What the team sees for a real request is on{' '}
              <Link to="/admin/applications?tab=markets" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                Applications, Market requests<Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
              : their answers beside what their profile says, the reason with a Translate button, and Decline that works without writing anything.
            </p>
          </Note>
        </>
      )}
    </LabPage>
  )
}
