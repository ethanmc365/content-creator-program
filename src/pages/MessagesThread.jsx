import { chromeGestureHandlers } from '../lib/chatChrome'
import { formatMessageTime, messageTimeTitle, cx } from '../lib/utils'
import { Avatar, Skeleton, Spinner } from '../components/ui'
import { isSignedDmPath } from '../lib/chatMedia'
import { mediaType } from '../lib/media'
import { Link } from 'react-router-dom'
import PendingLabel from '../components/PendingLabel'
import { retryQueued, dropQueued } from '../lib/outbox'
import SeenBy from '../components/SeenBy'
import { withinEditWindow } from '../lib/messageActions'
import MessageActions from '../components/chat/MessageActions'
import ChatMedia from '../components/ChatMedia'
import ResourceCard from '../components/ResourceCard'
import { EntryReferenceCard } from '../components/EntryFeedback'
import MessageEditor from '../components/MessageEditor'
import { renderMessageBody } from '../lib/richText'
import Icon from '../components/Icon'
import { ChatSkeleton } from '../components/network/Skeletons'

// Part of Messages.jsx: every value it shows comes in as a prop from the page.
export default function MessagesThread({
  actionsFor,
  active,
  activeMembers,
  bottomRef,
  deleteDm,
  dmComposerRef,
  dmPreview,
  dmReactorNames,
  editingId,
  entryRefs,
  isAdmin,
  isGroup,
  isMobile,
  kbOpen,
  loadingThread,
  memberById,
  mt,
  nowTick,
  onScrollMessages,
  reactionSummary,
  reactorName,
  saveMedia,
  scrollToMessage,
  scrollerRef,
  seenBy,
  setActionsFor,
  setEditingId,
  setReplyTo,
  setReporting,
  setThread,
  setViewing,
  settled,
  signedUrls,
  thread,
  threadSearch,
  toggleReaction,
  tr,
  user,
  visibleThread,
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div
      ref={scrollerRef}
      // The browser must not anchor this scroller: lib/chatScroll already owns
      // where it sits, and two mechanisms moving one scroller is the jitter.
      data-chat-scroller
      onScroll={onScrollMessages}
      {...chromeGestureHandlers}
      // Tapping the thread dismisses the keyboard (WhatsApp-style); a
      // scroll drag doesn't fire click, so scrolling history leaves it up.
      onClick={() => { if (isMobile && kbOpen) document.activeElement?.blur?.() }}
      // A THREAD WITH NOTHING IN IT MUST STILL OWN THE GESTURE.
      //
      //    The team: "on mobile, scrolling on a chat with no messages or only one or two
      //    messages causes a weird laggy glitch where the screen starts juttering."
      //
      //    Only on the short ones, and that is the whole clue. A scroller whose
      //    content fits has no scroll range, so iOS does not treat the drag as
      //    belonging to it and hands the gesture up the tree. What is up the tree on
      //    this screen is an overlay whose `top`, `height` and `transform` are all
      //    computed from `visualViewport` (see `mobileStyle`) - so a gesture that
      //    reaches the page moves the visual viewport, the hook re-reads it, the
      //    overlay re-renders into a new position, and a 300ms height transition eases
      //    towards a target that has already changed again. That is the judder, and it
      //    is unreachable on a full thread because a full thread absorbs the drag.
      //
      //    `overscroll-none` rather than `overscroll-contain`: `contain` stops the
      //    scroll CHAINING to an ancestor but still permits the local bounce, and the
      //    bounce is what iOS reports as viewport movement. `none` removes both.
      //
      //    `after:h-px` is the other half and it is not a hack, it is the precondition
      //    `none` needs: `overscroll-behavior` only applies to a scroll CONTAINER, and
      //    a box with no overflow is not one. One transparent pixel below the last
      //    message is enough to make it scrollable, which is enough to make it the
      //    owner of every drag that starts inside it. It costs nothing to the pin -
      //    `scrollTop = scrollHeight` clamps to the same place either way.
      className={cx(
        'min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-none overflow-x-hidden touch-pan-y touch-pinch-zoom px-5 py-6 after:block after:h-px after:w-full after:shrink-0 after:content-[""]',
        // See `settled`. Opacity only, and never a conditional
        // render: the rows have to be laid out for the pin to have a
        // scroll height to pin to.
        'transition-opacity duration-150',
        settled ? 'opacity-100' : 'opacity-0',
      )}
    >
      {loadingThread && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-3/5" /></div>}
      {!loadingThread && visibleThread.map((m, i) => {
        // Only the first screenful animates. A thread of two hundred
        // messages animating every row on open is a page that shudders
        // for a second and a half; the ones above the fold carry the
        // arrival and the rest are simply there.
        const entering = i >= visibleThread.length - 12
        const mine = m.sender_id === user.id
        // WHO SAID IT. A 1:1 never needed this - there are two people
        // and one of them is you - but eight anonymous grey bubbles
        // is not a conversation. Shown once per run of consecutive
        // messages from the same person, and suppressed entirely
        // while searching, where "consecutive" is not true.
        const sender = isGroup && !mine ? memberById.get(m.sender_id) : null
        const startsRun = !threadSearch.trim()
          ? visibleThread[i - 1]?.sender_id !== m.sender_id
          : true
        // Private DM media resolves to a signed URL; legacy public URLs pass through.
        const imageSrc = m.image_url ? (isSignedDmPath(m.image_url) ? signedUrls.get(m.image_url) : m.image_url) : null
        const isVid = m.image_url && mediaType(m.image_url) === 'video'
        const summary = reactionSummary(m.id)
        const orig = m.reply_to ? thread.find((x) => x.id === m.reply_to) : null
        const showActions = actionsFor === m.id
        return (
          <div
            key={m.id}
            id={`dm-${m.id}`}
            data-msg
            className={cx(
              // `group/msg` is the NAMED group MessageActions hangs
              // its hover state on. The plain `group` stays because
              // other things inside the row use it; an unnamed
              // `group-hover:` cannot see a named group and vice
              // versa, which is why the pill never appeared here.
              'group/msg group flex gap-2',
              mine && 'justify-end',
              entering && 'animate-fade-up',
              // THE ROW THAT HAS SOMETHING OPEN HAS TO COME FORWARD.
              // `animate-fade-up` is `both`-filled, so the transform
              // stays applied after it ends and every animated row is
              // its own stacking context for good. A later row
              // therefore paints over an earlier row's popover
              // whatever z-index the popover carries - which is why
              // the emoji panel opened underneath the next message.
              showActions && 'relative z-30',
            )}
            style={entering ? { animationDelay: `${Math.min(i, 12) * 24}ms` } : undefined}
          >
            {/* THE FACE IS INSIDE MessageActions NOW. It used to be a sibling here, `self-end` in this flex row - so the
                moment the action bar made space under the bubble the row grew and the face went down with it. Passed as
                `lead`, it shares a row with the bubble alone and nothing opening underneath can reach it. */}
            <div
              // A queued message fades back a little: still yours,
              // still there, just not out in the world yet.
              className={cx('w-full min-w-0 max-w-[80%] sm:max-w-[65%]', m.pending && 'opacity-60')}
              // PRESS A MESSAGE TO OPEN ITS ACTIONS. AT EVERY WIDTH.
              // THE BUG THIS FIXES: this was gated on `isMobile`, and a laptop was meant to get the actions on hover
              // instead - which nobody could make appear. One behaviour now, the same one the rooms use. A press that
              // ended a text selection is not a press.
              // ONLY THE BUBBLE OPENS THE BAR - same rule as the
              // rooms. The name line, the chips and the "Seen by"
              // receipt are inside this column too, and a press on
              // any of them used to toggle react/reply.
              onClick={(e) => {
                if (!e.target.closest?.('[data-msg-bubble]')) return
                if (e.target.closest('a,button,video,input')) return
                if (!window.getSelection?.()?.isCollapsed) return
                setActionsFor(showActions ? null : m.id)
              }}
            >
            {/* THE SAME ACTION PILL THE ROOMS USE.
                The DMs and the rooms had two hand-written copies of
                this, and both had drifted into the same three faults:
                the pill straddled the message so a short one was
                covered entirely, it was anchored to the message COLUMN
                so it jumped a row the moment anybody reacted, and it
                hung off the outer edge, which is the edge of the
                screen. One component now, so a fix lands in both. */}
            <MessageActions
              side={mine ? 'right' : 'left'}
              open={showActions}
              onClose={() => setActionsFor(null)}
              lead={isGroup && !mine ? (
                <Link
                  to={`/profile/${m.sender_id}`}
                  className="block rounded-full transition-transform hover:scale-105"
                  title={sender?.name ? `View ${sender.name}` : 'View profile'}
                  aria-label={sender?.name ? `View ${sender.name}` : 'View profile'}
                >
                  <Avatar src={sender?.photo_url} name={sender?.name} size="xs" />
                </Link>
              ) : null}
              reactions={Object.entries(summary).map(([emoji, info]) => [emoji, info.count, info.mine, dmReactorNames(info), info.ids || []])}
              myId={user?.id}
              onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
              // SAME SLOT AS THE ROOMS. These used to sit inside
              // `children`, which put the timestamp and "Seen by"
              // ABOVE the reaction chips here and BELOW them in a
              // room - the same message furniture in two different
              // orders on two surfaces that are meant to be
              // identical. In the footer they are in one place, and
              // the pill stays out of their way on both.
              footer={(
                <>
                  <p className={cx('mt-1 text-[10px] text-gray-400', mine && 'text-right')}>
                    <span title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                    {/* A TEAM EDIT IS NOT ANNOUNCED TO CREATORS. */}
                    {m.edited_at && (isAdmin || !(mine ? isAdmin : isGroup ? sender?.is_admin : active?.other?.is_admin)) && <span title={`Edited ${messageTimeTitle(m.edited_at)}`}> · edited</span>}
                    {m.pending
                      ? <PendingLabel tries={m.tries} prefix=" · " />
                      : (mine && !isGroup && m.read && ' · Read')}
                  </p>
                  {m.failed && (
                    <p className={cx('mt-0.5 text-[10px] text-smoke', mine && 'text-right')}>
                      Not sent yet.{' '}
                      <button type="button" onClick={() => retryQueued(m.queuedId)} className="font-semibold text-brand underline">{tr("Retry")}</button>
                      {' · '}
                      <button type="button" onClick={() => dropQueued(m.queuedId)} className="font-semibold underline">{tr("Discard")}</button>
                    </p>
                  )}
                  {mine && isGroup && (() => {
                    const seen = seenBy(m)
                    return seen.length ? (
                      <div className="mt-0.5 flex justify-end">
                        <SeenBy readers={seen} align="right" />
                      </div>
                    ) : null
                  })()}
                </>
              )}
              actions={m.pending || m.failed ? [] : [
            ...(mt.canFor(m) && !mine
              ? [{ icon: 'language', label: mt.isOn(m) ? 'Show original' : 'Translate', title: mt.isOn(m) ? 'Show the original' : 'Translate this message', onClick: () => mt.toggle(m) }]
              : []),
                // MEDIA GETS TWO MORE, AND THEY LEAD - same bar, same
                // order as the rooms. `imageSrc` and not
                // `m.image_url`: a DM attachment is a PRIVATE storage
                // path, and only the signed URL is fetchable, so both
                // of these have to use the one the bubble is already
                // rendering.
                ...((m.image_url && imageSrc)
                  ? [
                    {
                      icon: 'expand',
                      label: 'Full screen',
                      title: 'Open full screen',
                      onClick: () => setViewing({ url: imageSrc, kind: isVid ? 'video' : 'image' }),
                    },
                    {
                      icon: 'download',
                      label: 'Save',
                      title: isVid ? 'Save this video' : 'Save this photo',
                      onClick: () => saveMedia(imageSrc),
                    },
                  ]
                  : []),
                { icon: 'reply', label: 'Reply', title: 'Reply to this message', onClick: () => { setReplyTo(m); setActionsFor(null); dmComposerRef.current?.focus() } },
                ...(mine && withinEditWindow(m.created_at, nowTick)
                  ? [{ icon: 'pencil', label: 'Edit message', title: 'Edit (5 minutes)', onClick: () => { setEditingId(m.id); setActionsFor(null) } }]
                  : []),
                ...(mine
                  ? [{ icon: 'trash', label: 'Delete message', title: 'Delete for everyone', danger: true, onClick: () => deleteDm(m) }]
                  : []),
                // A DM is the one place a creator is most exposed and
                // has the least recourse: a stranger gets one message
                // through before you have agreed to talk at all.
                ...(!mine
                  ? [{ icon: 'flag', label: 'Report message', title: 'Report to the team', danger: true, onClick: () => { setReporting(m); setActionsFor(null) } }]
                  : []),
              ]}
            >
              {isGroup && !mine && startsRun && (
                <p className="mb-0.5 truncate pl-1 text-[11px] font-semibold text-smoke">
                  {sender?.name ?? 'Someone'}
                </p>
              )}
              {/* THE BUBBLE IS SHRINK-TO-FIT, like the rooms'.
                  It was a plain block inside a `w-full` column, so
                  every bubble was drawn at the full 80%/65% of the
                  thread whatever was in it: "whenever I send a short
                  message the text box is still super long". `w-fit`
                  takes the bubble down to its content and `max-w-full`
                  keeps a paragraph wrapping at the column's cap;
                  `ml-auto` puts yours back against the right edge,
                  since a shrunk bubble no longer reaches it. */}
              <div
                data-msg-bubble
                className={cx(
                // A BUBBLE BEING EDITED TAKES THE WHOLE COLUMN. It is
                // `w-fit`, so while the editor is inside it the width
                // would otherwise be decided by the editor's own
                // min-width - see components/MessageEditor.
                editingId === m.id ? 'w-full' : 'w-fit',
                'max-w-full whitespace-pre-line break-words rounded-2xl text-sm leading-relaxed',
                m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                mine ? 'ml-auto rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink'
              )}>
                {/* Quoted reply */}
                {m.reply_to && (
                  <button
                    type="button"
                    onClick={() => orig && scrollToMessage(orig.id)}
                    className={cx(
                      'mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-2 px-2.5 py-1 text-left',
                      m.image_url && 'mx-0.5 mt-0.5',
                      mine ? 'border-white/70 bg-white/15' : 'border-brand/60 bg-black/[0.04]'
                    )}
                  >
                    <span className={cx('block truncate text-[11px] font-semibold', mine ? 'text-white' : 'text-brand')}>
                      {orig ? (orig.sender_id === user.id ? 'You' : reactorName(orig.sender_id)) : 'Original message'}
                    </span>
                    {/* line-clamp, NOT truncate: nowrap made this preview's min-content
                        width the whole quoted line, and the shrink-to-fit bubble grew to
                        match, so replying to a long message ran off screen. */}
                    <span className={cx('line-clamp-1 text-xs [overflow-wrap:anywhere]', mine ? 'text-white/80' : 'text-smoke')}>{dmPreview(orig)}</span>
                  </button>
                )}
                {m.image_url && (
                  imageSrc ? (
                    // A tap opens this message's own bar, which is
                    // where Full screen and Save now live.
                    <ChatMedia
                      url={imageSrc} kind={isVid ? 'video' : 'image'} alt={m.body || 'Shared image'}
                      w={m.media_w} h={m.media_h}
                      onTap={() => setActionsFor((cur) => (cur === m.id ? null : m.id))}
                    />
                  ) : (
                    <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-cloud"><Spinner /></div>
                  )
                )}
                {/* Feedback from the team arrives with the entry it
                    is about attached. */}
                {m.resource_id && (
                  <span className={cx('block', m.image_url && 'px-2.5 pt-1.5')}>
                    <ResourceCard resourceId={m.resource_id} />
                  </span>
                )}

                {m.submission_id && (
                  <span className={cx('block', m.image_url && 'px-2.5 pt-1.5')}>
                    <EntryReferenceCard entry={entryRefs[m.submission_id]} onDark={mine} />
                  </span>
                )}
                {/* MARKDOWN, LIKE EVERY OTHER SURFACE. The DMs printed
                    the raw body, so a message written with the
                    formatting buttons - which the DMs now have -
                    arrived as literal asterisks and hashes. */}
                {editingId === m.id ? (
                  <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>
                    <MessageEditor
                      kind="dm"
                      message={m}
                      onDark={mine}
                      onCancel={() => setEditingId(null)}
                      onSaved={(next) => {
                        setThread((cur) => cur.map((x) => (x.id === next.id ? { ...x, body: next.body, edited_at: next.edited_at } : x)))
                        setEditingId(null)
                      }}
                    />
                  </span>
                ) : (
                  m.body && (
                    <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>
                      {renderMessageBody(mt.textFor(m), { rich: true, members: activeMembers, onDark: mine })}
                      {mt.isOn(m) && (
                        <button type="button" onClick={() => mt.toggle(m)} className={cx('mt-1 inline-flex items-center gap-1 text-[11px] font-semibold', mine ? 'text-white/80' : 'text-brand')}>
                          <Icon name="language" className="h-3 w-3" />{tr('Translated')} · {tr('Show original')}
                        </button>
                      )}
                      {mt.isBusy(m) && <span className="mt-1 block text-[11px] text-smoke">{tr('Translating…')}</span>}
                      {mt.isOn(m) && mt.isSame(m) && <span className={cx('mt-1 block text-[11px]', mine ? 'text-white/80' : 'text-smoke')}>{tr('Already in your language.')}</span>}
                      {mt.isFailed(m) && <span className={cx('mt-1 block text-[11px]', mine ? 'text-white/80' : 'text-smoke')}>{tr("This message can't be translated right now.")}</span>}
                    </span>
                  )
                )}
              </div>
            </MessageActions>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>

    {!settled && (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <ChatSkeleton fill rows={6} />
      </div>
    )}
    </div>
  )
}
