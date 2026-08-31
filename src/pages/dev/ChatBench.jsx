// The chat message furniture, on a bench. See Preview.jsx for why this exists.
//
// What it is here to answer, all of which were reported as broken and none of
// which could be checked without logging in:
//   * is the action pill ALWAYS below the bubble, on both surfaces?
//   * does it ever cover the reaction chips, the "edited" note or "Seen by"?
//   * does it survive being on the first message in a scroller (the old build
//     clipped it against the scroll container's top edge)?
//   * do the reaction chips say who reacted?
import MessageActions from '../../components/chat/MessageActions'
import SeenBy from '../../components/SeenBy'
import { cx } from '../../lib/utils'

const READERS = [
  { id: 'r1', name: 'Ana Duarte', photo_url: null },
  { id: 'r2', name: 'Ben Olsen', photo_url: null },
  { id: 'r3', name: 'Chi Nwosu', photo_url: null },
]

const SHORT = 'thanks'
const TALL = 'Landed in Lisbon this morning and the light on the Alfama rooftops was unreal. '
  + 'Shot three clips before breakfast, one of them is the best thing I have filmed all year. '
  + 'Posting tonight once the hotel wifi stops pretending to be a dial-up modem. '
  + 'If anyone else is here this week say so and we can shoot something together.'

// Every case that has ever gone wrong, in one column.
const CASES = [
  { key: 'first-short-other', label: 'FIRST in thread, short, someone else', mine: false, body: SHORT, chips: [], seen: [] },
  { key: 'short-mine-chips', label: 'short, mine, 2 chips + Seen by', mine: true, body: SHORT, seen: READERS,
    chips: [['❤️', 2, true, ['You', 'Ana Duarte']], ['🔥', 1, false, ['Ben Olsen']]] },
  { key: 'tall-other-chips', label: 'TALL, someone else, 1 chip', mine: false, body: TALL,
    chips: [['👏', 4, false, ['Ana Duarte', 'Ben Olsen', 'Chi Nwosu', 'Dee Ray']]], seen: [] },
  { key: 'tall-mine-seen', label: 'TALL, mine, Seen by 3', mine: true, body: TALL, chips: [], seen: READERS },
  { key: 'short-other-many', label: 'short, someone else, 4 chips', mine: false, body: SHORT, seen: [],
    chips: [['❤️', 1, false, ['Ana Duarte']], ['🔥', 1, false, ['Ben Olsen']], ['👏', 1, false, ['Chi Nwosu']], ['😂', 1, false, ['Dee Ray']]] },
]

const ACTIONS = [
  { icon: 'reply', label: 'Reply', title: 'Reply to this message' },
  { icon: 'pencil', label: 'Edit message', title: 'Edit (5 minutes)' },
  { icon: 'trash', label: 'Delete message', title: 'Delete for everyone', danger: true },
]

function Row({ c, revealed }) {
  return (
    <div className={cx('group/msg flex gap-2 px-3 py-1.5', c.mine && 'flex-row-reverse')}>
      <div className="w-9 shrink-0" />
      <div className={cx('flex w-full min-w-0 max-w-[82%] flex-col sm:max-w-[68%]', c.mine && 'items-end')}>
        <MessageActions
          className="w-full"
          side={c.mine ? 'right' : 'left'}
          revealed={revealed}
          reactions={c.chips}
          onToggleReaction={() => {}}
          actions={ACTIONS}
          footer={(
            <>
              <p className={cx('mt-0.5 px-1 text-[10px] text-gray-400', c.mine && 'text-right')}>edited</p>
              {c.seen.length > 0 && (
                <div className={cx('mt-0.5 flex', c.mine && 'justify-end')}>
                  <SeenBy readers={c.seen} align={c.mine ? 'right' : 'left'} />
                </div>
              )}
            </>
          )}
        >
          <p className={cx('mb-1 flex items-baseline gap-x-2 px-1', c.mine && 'flex-row-reverse')}>
            <span className={cx('text-sm font-semibold', c.mine && 'text-brand')}>{c.mine ? 'You' : 'Ana Duarte'}</span>
            <span className="text-[11px] text-smoke">09:41</span>
          </p>
          <div data-msg-bubble className={cx(
            'w-fit max-w-full rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
            c.mine ? 'ml-auto rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink',
          )}>
            <span className="whitespace-pre-wrap break-words">{c.body}</span>
          </div>
        </MessageActions>
      </div>
    </div>
  )
}

// `revealed` is forced on for every row so the pill is measurable without a
// hover - the whole point is to see where it lands.
export default function ChatBench({ width = 375 }) {
  return (
    <div style={{ width }} className="shrink-0">
      <p className="mb-1 font-mono text-[11px] font-semibold">{width}px</p>
      <div
        data-chat-scroller
        className="h-[560px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-2"
      >
        {CASES.map((c) => <Row key={c.key} c={c} revealed />)}
      </div>
    </div>
  )
}

export { CASES }
