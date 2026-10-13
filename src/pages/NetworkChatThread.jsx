import { chromeGestureHandlers } from '../lib/chatChrome'
import { cx, formatMessageTime, messageTimeTitle } from '../lib/utils'
import { ChatSkeleton } from '../components/network/Skeletons'
import Icon from '../components/Icon'
import { Fragment } from 'react'
import { motion } from 'motion/react'
import { CARD_KINDS, cardOnly, boardBubble, pollBubble, framed, AttachedCard } from './NetworkChatParts'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/ui'
import PendingLabel from '../components/PendingLabel'
import { retryQueued, dropQueued } from '../lib/outbox'
import SeenBy from '../components/SeenBy'
import { withinEditWindow } from '../lib/messageActions'
import MessageActions from '../components/chat/MessageActions'
import { QuotedParent } from './NetworkChatQuotedParent'
import ChatMedia from '../components/ChatMedia'
import MessageEditor from '../components/MessageEditor'
import IntroCard from '../components/network/IntroCard'
import { Highlight } from '../components/network/ChatExtras'
import { renderMessageBody } from '../lib/richText'

// Part of NetworkChat.jsx: every value it shows comes in as a prop from the page.
export default function NetworkChatThread({
  actionsFor,
  byId,
  canPost,
  composerRef,
  editingId,
  farFromEnd,
  firstUnread,
  introOf,
  introducing,
  isAdmin,
  jumpToEnd,
  loading,
  members,
  messages,
  mt,
  nameFor,
  nowTick,
  onScroll,
  quietMount,
  reactionsByMessage,
  relations,
  removeMessage,
  saveMedia,
  scrollerRef,
  search,
  seenBy,
  setActionsFor,
  setEditingId,
  setMessages,
  setRelations,
  setReplyTo,
  setReporting,
  setViewing,
  settled,
  toggleReaction,
  tr,
  user,
  visible,
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div
      ref={scrollerRef}
      // The browser must not anchor this scroller: lib/chatScroll already owns
      // where it sits, and two mechanisms moving one scroller is the jitter.
      data-chat-scroller
      onScroll={onScroll}
      {...chromeGestureHandlers}
      className={cx(
        // The rooms share the DM overlay's geometry and therefore its trap:
        // see the long note on the thread scroller in Messages.jsx. An empty
        // room is commoner than an empty DM, not rarer.
        'flex-1 space-y-4 overflow-y-auto overscroll-none overflow-x-hidden px-4 py-4 touch-pan-y touch-pinch-zoom sm:px-5 after:block after:h-px after:w-full after:shrink-0 after:content-[""]',
        // See `settled` above. Opacity only, and never `visibility` or a
        // conditional render: the rows have to be laid out for the pin to
        // have a scroll height to pin to.
        'transition-opacity duration-150',
        settled ? 'opacity-100' : 'opacity-0',
      )}
    >
      {loading ? (
        <ChatSkeleton />
      ) : messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Icon name="chat" className="h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium">{tr("Nothing here yet")}</p>
          <p className="max-w-xs text-xs text-smoke">
            {tr("This room is brand new. It is separate from every other market, so it starts empty.")}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Icon name="magnifier" className="h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium">No messages match &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        visible.map((m, i) => {
          const prev = visible[i - 1]
          const mine = m.sender_id === user?.id
          // Grouping is suppressed while searching: consecutive results are
          // not consecutive messages, so hiding the second author is a lie.
          const grouped = !search && prev && prev.sender_id === m.sender_id
          const reactions = reactionsByMessage.get(m.id) || []
          // [[emoji, count, isMine]] - the shape MessageActions draws.
          const chips = (() => {
            const byEmoji = new Map()
            for (const r of reactions) {
              // [emoji, count, isMine, names] - the names are what the chip's
              // hover tooltip says, so a count always has people behind it.
              const row = byEmoji.get(r.emoji) || [r.emoji, 0, false, [], []]
              row[1] += 1
              row[4].push(r.creator_id)
              if (r.creator_id === user?.id) { row[2] = true; row[3].push('You') }
              else row[3].push(nameFor(r.creator_id))
              byEmoji.set(r.emoji, row)
            }
            return [...byEmoji.values()]
          })()
          const seen = (isAdmin || mine) ? seenBy(m) : []
          return (
            <Fragment key={m.id}>
            {firstUnread?.id === m.id && (
              <div role="separator" className="flex items-center gap-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand animate-fade-up">
                <span className="h-px flex-1 bg-brand/30" />{tr('New messages')}<span className="h-px flex-1 bg-brand/30" />
              </div>
            )}
            <motion.div
              key={m.id}
              id={`msg-${m.id}`}
              // A LIGHTER ENTRANCE (13 Oct 2026). Ethan: switching from General to Worldwide and scrolling "is a little bit
              // laggy". A room opened with fourteen rows on a spring that took most of a second to settle (and scaled,
              // which re-rasters every bubble each frame), so the first scroll fought it. Now eight rows, a 320ms
              // ease-out, transform and opacity only.
              initial={quietMount || (introducing && visible.length - 1 - i > 8) ? false : { opacity: 0, y: introducing ? 10 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={introducing ? { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: Math.max(0, 8 - (visible.length - 1 - i)) * 0.03 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              // PRESS THE BUBBLE TO OPEN ITS ACTIONS. AT EVERY WIDTH.
              // This used to be `if (!isMobile) return`, with a laptop given
              // a hover state instead - two behaviours for one control, and
              // the hover one was the worse of them. Presses on a link, a
              // button or a video are left alone so this never eats a real
              // one, and a press that ENDED A TEXT SELECTION is not a press:
              // dragging across a message to copy it would otherwise open the
              // bar every time.
              //
              // **ONLY THE BUBBLE OPENS THE BAR.** The handler used to sit on
              // the whole ROW, which includes the avatar gutter and the name
              // line - so pressing somebody's face opened react/reply instead
              // of opening the person. The face is a link to their profile
              // now, and this asks for `[data-msg-bubble]` explicitly rather
              // than listing the things it must not eat.
              onClick={(e) => {
                if (!e.target.closest?.('[data-msg-bubble]')) return
                if (e.target.closest?.('a,button,video,input')) return
                if (!window.getSelection?.()?.isCollapsed) return
                setActionsFor((cur) => (cur === m.id ? null : m.id))
              }}
              // `relative z-20` when this row has something open. Every row
              // here is a motion.div carrying a transform, so each is its own
              // stacking context and a later message paints over an earlier
              // one's popover whatever z-index the popover has.
              className={cx(
                // 13 Oct 2026: hover only where there is a mouse. On a phone a tapped row kept :hover (and :focus-within) and so
                // the same z-20 as a row with its bar open, and a later such row painted over the open row's pop-up.
                'group/msg relative flex gap-2.5 hoverable:hover:z-20',
                // YOUR OWN MESSAGES SIT ON THE RIGHT.
                //
                // THE REPORTED BUG: "whenever I send a message in any of
                // these rooms it shows up on the left side, which is weird
                // because normally mine shows on the right and everyone
                // else's on the left. It's like I'm sending a message and it
                // appears as if someone else sent it."
                //
                // Nothing was ever wrong on the way to the database. This was
                // a flat Slack-style log where every row was drawn
                // identically, and the DMs three tabs away bubble your side -
                // so the rooms looked broken by comparison. Marking the
                // author "You" (the previous attempt) was not enough: the
                // SHAPE is what people read, not the label.
                mine && 'flex-row-reverse',
                grouped && '!mt-1',
                // Quiet, not alarming: a queued message is a message, just
                // one the world has not seen yet.
                m.pending && 'opacity-60',
                actionsFor === m.id && '!z-30',
              )}
            >
              {/* THE FACE COLUMN, AND ONLY WHERE A FACE CAN GO.
                  It is not reserved on YOUR rows: your messages never draw an
                  avatar, and the row is `flex-row-reverse`, so an empty 36px
                  column plus its gap sat against the right edge of every
                  message you sent. Ethan: "when I send a message there's a
                  lot of unnecessary white space on the right side."

                  A FACE ON EVERY MESSAGE, INCLUDING A RUN FROM ONE PERSON.
                  The column used to be reserved-but-empty under the first of
                  a run, on the Slack reasoning that repeating the avatar is
                  noise. It is not noise here, because these bubbles are
                  tinted and shrink-to-fit: a run of four short messages from
                  announcements drew one face and then three bubbles hanging
                  off nothing, indented past an empty gutter. Ethan: "I
                  noticed it was showing up like it was floating because there
                  was no profile picture beside it... it should still show up
                  the profile photo on the left hand side even if the creator
                  sent multiple messages, just for the UI, so it looks
                  clean."
                  The NAME line is still once per run - that is the repetition
                  that actually reads as noise, and it is not what anchors the
                  bubble to the left edge. */}
              {/* THE FACE OPENS THE PERSON. It is a link, not decoration:
                  pressing a profile picture in a chat means "who is this",
                  and it used to open the react/reply bar because the press
                  handler was on the row. */}
              {/* THE FACE MOVED INSIDE MessageActions (28 Sep 2026). Here
                  it was `self-end` in this row, so opening the action bar -
                  which makes space under the bubble - grew the row and took
                  the face down with it. It is passed as `lead` now and shares
                  a row with the bubble alone. Same change in the DMs. */}

              {/* A framed poll or board uses the whole row on a phone: at 82% a poll was so narrow its options truncated. */}
              <div className={cx('flex w-full min-w-0 flex-col sm:max-w-[68%]', framed(m) && editingId !== m.id ? 'max-w-full' : 'max-w-[82%]', mine && 'items-end')}>
                {/* THE META LINE IS INSIDE MessageActions, and that is the
                    point. The pill hangs off the TOP of whatever this wraps;
                    wrapping the bubble alone put it exactly where "You ·
                    just now" is, so hovering your own message hid who sent it
                    and when. Wrapping the meta line too lifts it clear of
                    everything belonging to this message. It still cannot move
                    when somebody reacts, because the chips are added at the
                    BOTTOM of the wrapper and the pill is anchored to the top. */}
                <MessageActions
                  className="w-full"
                  side={mine ? 'right' : 'left'}
                  leadWidth={9}
                  lead={!mine ? (
                    m.profiles?.id ? (
                      <Link
                        to={`/profile/${m.profiles.id}`}
                        className="block rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        title={m.profiles?.name ? `View ${m.profiles.name}` : 'View profile'}
                        aria-label={m.profiles?.name ? `View ${m.profiles.name}` : 'View profile'}
                      >
                        <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                      </Link>
                    ) : (
                      <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                    )
                  ) : null}
                  reactions={chips}
                  myId={user?.id}
                  onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
                  open={actionsFor === m.id}
                  onClose={() => setActionsFor(null)}
                  // THE EDITED NOTE, THE OUTBOX STATE AND "SEEN BY" GO IN
                  // HERE rather than after the component. They used to be
                  // siblings underneath it, which is exactly where the pill
                  // now lives - so the control you were reaching for landed
                  // on top of the receipt you were trying to read. Passed in,
                  // they share the bottom row with the pill and MessageActions
                  // keeps the two at opposite ends of it.
                  footer={(
                    <>
                      {/* Only the team sees that a team message was edited (12 Oct 2026). */}
                      {m.edited_at && !m.pending && (isAdmin || !m.profiles?.is_admin) && (
                        <p className={cx('mt-0.5 px-1 text-[10px] text-gray-400', mine && 'text-right')}>edited</p>
                      )}
                      {m.pending && (
                        <PendingLabel tries={m.tries} className="mt-0.5 block px-1 text-[11px] text-gray-400" />
                      )}
                      {m.failed && (
                        <p className="mt-0.5 px-1 text-[11px] text-smoke">
                          Not sent yet.{' '}
                          <button type="button" onClick={() => retryQueued(m.queuedId)} className="font-semibold text-brand underline">{tr("Retry")}</button>
                          {' · '}
                          <button type="button" onClick={() => dropQueued(m.queuedId)} className="font-semibold underline">{tr("Discard")}</button>
                        </p>
                      )}
                      {seen.length > 0 && (
                        <div className={cx('mt-0.5 flex', mine && 'justify-end')}>
                          <SeenBy readers={seen} align={mine ? 'right' : 'left'} pollId={m.poll_id || null} />
                        </div>
                      )}
                    </>
                  )}
                  // Reply to anything, edit yours for five minutes, delete
                  // yours (or anybody's, as an admin), report somebody
                  // else's. A pending message has no id on the server yet, so
                  // none of them apply to it.
                  actions={m.pending || m.failed ? [] : [
                    ...(mt.canFor(m) && !mine
                      ? [{ icon: 'language', label: mt.isOn(m) ? 'Show original' : 'Translate', title: mt.isOn(m) ? 'Show the original' : 'Translate this message', onClick: () => mt.toggle(m) }]
                      : []),
                    // MEDIA GETS TWO MORE, AND THEY LEAD. On a message that
                    // is a photograph, "look at it properly" and "keep it"
                    // are what somebody pressed it for; reply and react are
                    // the same as on any other message and can follow.
                    ...((m.image_url || m.video_url)
                      ? [
                        {
                          icon: 'expand',
                          label: 'Full screen',
                          title: 'Open full screen',
                          onClick: () => setViewing({ url: m.image_url || m.video_url, kind: m.image_url ? 'image' : 'video' }),
                        },
                        {
                          icon: 'download',
                          label: 'Save',
                          title: m.image_url ? 'Save this photo' : 'Save this video',
                          onClick: () => saveMedia(m.image_url || m.video_url),
                        },
                      ]
                      : []),
                    ...(canPost
                      ? [{ icon: 'reply', label: 'Reply', title: 'Reply to this message', onClick: () => { setReplyTo(m); setActionsFor(null); composerRef.current?.focus() } }]
                      : []),
                    ...(mine && withinEditWindow(m.created_at, nowTick)
                      ? [{ icon: 'pencil', label: 'Edit message', title: 'Edit (5 minutes)', onClick: () => { setEditingId(m.id); setActionsFor(null) } }]
                      : []),
                    ...(mine || isAdmin
                      ? [{ icon: 'trash', label: 'Delete message', title: 'Delete for everyone', danger: true, onClick: () => removeMessage(m) }]
                      : []),
                    ...(!mine
                      ? [{ icon: 'flag', label: 'Report message', title: 'Report to the team', danger: true, onClick: () => { setReporting(m); setActionsFor(null) } }]
                      : []),
                  ]}
                >
                  {!grouped && (
                    <p className={cx('mb-1 flex flex-wrap items-baseline gap-x-2 px-1', mine && 'flex-row-reverse')}>
                      <span className={cx('text-sm font-semibold', mine && 'text-brand')}>
                        {mine ? 'You' : (m.profiles?.name || 'Someone')}
                      </span>
                      {!mine && m.profiles?.is_admin && (
                        <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">{tr("Team")}</span>
                      )}
                      <span className="text-[11px] text-smoke" title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                    </p>
                  )}
                  {/* THE BUBBLE. Shrink-to-fit, so a two-word message is a
                      two-word bubble; the column above caps it at 82% of the
                      thread so a paragraph still wraps. */}
                  <div
                    data-msg-bubble
                    className={cx(
                      // A BUBBLE BEING EDITED TAKES THE WHOLE COLUMN. It is
                      // `w-fit`, so while the editor is inside it the width
                      // would otherwise be decided by the editor's own
                      // min-width - see components/MessageEditor.
                      editingId === m.id ? 'w-full' : boardBubble(m) ? 'w-full sm:w-[29rem]' : pollBubble(m) ? 'w-full max-w-[26rem]' : 'w-fit',
                      'max-w-full rounded-2xl text-sm leading-relaxed',
                      // A SHARED LEADERBOARD IS A MESSAGE AGAIN (13 Oct 2026). Ethan: "I still prefer it when it was in an
                      // actual text bubble because then people could react to it ... can't you reverse that, but just
                      // improve it more?" The words and the live board share ONE bubble, so pressing anywhere on it opens
                      // the reactions bar like any message - but a white one, never the orange that he did not want
                      // round a leaderboard, sitting on the sender's side rather than across the middle of the room.
                      framed(m) && editingId !== m.id
                        // YOUR OWN COLOUR, AND A FRAME TO PRESS (13 Oct 2026). Ethan: "it's not showing the orange
                        // background like my actual message shows ... make the background a little bit bigger so it's
                        // clickable". The bubble is the sender's normal bubble (orange for you, grey for others) with
                        // a wide margin round the white board, and that margin is what opens the reactions.
                        ? cx('p-2.5 sm:p-3', mine ? 'ml-auto rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink')
                      // AN INTRO IS ITS OWN CARD, NOT A BUBBLE AROUND ONE. Nor is a card posted with no words.
                      : (introOf(m) || cardOnly(m)) && editingId !== m.id
                        ? cx('!bg-transparent !p-0 text-ink', mine && 'ml-auto')
                        : cx(
                          mine ? 'ml-auto rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink',
                          (m.image_url || m.video_url) ? 'overflow-hidden p-1.5' : 'px-3.5 py-2',
                        ),
                    )}
                  >
                    {/* WHAT THIS IS ANSWERING. A reply with no quote is a
                        non-sequitur three messages later. The quote is a
                        BUTTON: pressing it scrolls to the original and
                        flashes it, so a thread can be walked backwards. */}
                    {m.reply_to && (
                      <div className={cx((m.image_url || m.video_url) && 'px-2 pt-1.5')}>
                        <QuotedParent id={m.reply_to} lookup={byId} onDark={mine} />
                      </div>
                    )}
                    {/* A PHOTO IS PRESSED LIKE ANY OTHER MESSAGE. It opens
                        this message's own bar, which carries Save and Full
                        screen alongside reply / react / delete for anything
                        with media on it - see `actions` below. The picture no
                        longer owns a lightbox, a save button or a long-press
                        sheet of its own. */}
                    {m.image_url && (
                      <ChatMedia
                        url={m.image_url} kind="image" alt={m.body || 'Shared image'}
                        w={m.media_w} h={m.media_h}
                        onTap={() => setActionsFor((cur) => (cur === m.id ? null : m.id))}
                      />
                    )}
                    {m.video_url && (
                      <ChatMedia
                        url={m.video_url} kind="video"
                        onTap={() => setActionsFor((cur) => (cur === m.id ? null : m.id))}
                      />
                    )}
                    {editingId === m.id ? (
                      <div className={cx((m.image_url || m.video_url) && 'px-2 py-1.5')}>
                        <MessageEditor
                          kind="channel"
                          message={m}
                          onDark={mine}
                          onCancel={() => setEditingId(null)}
                          onSaved={(next) => {
                            setMessages((cur) => cur.map((x) => (x.id === next.id ? { ...x, body: next.body, edited_at: next.edited_at } : x)))
                            setEditingId(null)
                          }}
                        />
                      </div>
                    ) : introOf(m) && !search ? (
                      <IntroCard
                        intro={introOf(m)}
                        sender={m.profiles}
                        myId={user?.id}
                        relation={relations.get(m.sender_id) || null}
                        onRelation={(id, next) => setRelations((cur) => {
                          const copy = new Map(cur)
                          if (next) copy.set(id, next); else copy.delete(id)
                          return copy
                        })}
                      />
                    ) : cardOnly(m) && !framed(m) ? (
                      <AttachedCard message={m} />
                    ) : framed(m) ? (
                      <>
                        {m.body && (
                          <div className="whitespace-pre-wrap break-words px-1 pb-2.5 pt-0.5">
                            {search ? <Highlight text={m.body} term={search} /> : renderMessageBody(mt.textFor(m), { rich: true, members, onDark: mine })}
                            {mt.isOn(m) && (
                              <button type="button" onClick={() => mt.toggle(m)} className={cx('mt-1 inline-flex items-center gap-1 text-[11px] font-semibold', mine ? 'text-white/80' : 'text-brand')}>
                                <Icon name="language" className="h-3 w-3" />{tr('Translated')} · {tr('Show original')}
                              </button>
                            )}
                          </div>
                        )}
                        <AttachedCard message={m} />
                      </>
                    ) : (
                      m.body && (
                        <div className={cx('whitespace-pre-wrap break-words', (m.image_url || m.video_url) && 'px-2 py-1.5')}>
                          {search
                            ? <Highlight text={m.body} term={search} />
                            /* ANNOUNCEMENTS ARE LIKE EVERY OTHER MESSAGE (30 Sep 2026). They had their own
                               Translated / Original switch on top as well as the Translate action and the
                               "Show original" line under it - two controls for one job, and only in the
                               announcements room (Ethan saw it in Germany's). One way now, everywhere. */
                            : renderMessageBody(mt.textFor(m), { rich: true, members, onDark: mine })}
                          {mt.isOn(m) && (
                                <button type="button" onClick={() => mt.toggle(m)} className={cx('mt-1 inline-flex items-center gap-1 text-[11px] font-semibold', mine ? 'text-white/80' : 'text-brand')}>
                                  <Icon name="language" className="h-3 w-3" />{tr('Translated')} · {tr('Show original')}
                                </button>
                              )}
                              {mt.isBusy(m) && <span className="mt-1 block text-[11px] text-smoke">{tr('Translating…')}</span>}
                              {mt.isOn(m) && mt.isSame(m) && <span className={cx('mt-1 block text-[11px]', mine ? 'text-white/80' : 'text-smoke')}>{tr('Already in your language.')}</span>}
                              {mt.isFailed(m) && <span className={cx('mt-1 block text-[11px]', mine ? 'text-white/80' : 'text-smoke')}>{tr("This message can't be translated right now.")}</span>}
                        </div>
                      )
                    )}
                  </div>
                  {/* THE CARD SITS UNDER THE BUBBLE, NEVER IN IT (12 Oct 2026). Ethan: "I don't like that the leaderboard
                      appears on an orange card." A results share carries a sentence, so the board was drawn inside the
                      team's own orange bubble. Now the words are the bubble and the card is its own white thing below. */}
                  {CARD_KINDS.some((c) => m[c.idKey]) && !cardOnly(m) && !framed(m) && (
                    <div className={cx('mt-1.5 flex w-full', mine && 'justify-end')}>
                      <AttachedCard message={m} />
                    </div>
                  )}
                </MessageActions>
              </div>
            </motion.div>
            </Fragment>
          )
        })
      )}
    </div>

    {/* BACK TO THE LATEST, on a phone (the desktop bar has its own button). */}
    {farFromEnd && !search && (
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center lg:hidden">
        <button type="button" onClick={jumpToEnd}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-ink/90 px-3.5 py-2 text-[12px] font-bold text-white shadow-lift animate-pop-in active:scale-95">
          <Icon name="chevronDown" className="h-4 w-4" />{tr('Latest')}
        </button>
      </div>
    )}
    {!settled && (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <ChatSkeleton fill rows={6} />
      </div>
    )}
    </div>
  )
}
