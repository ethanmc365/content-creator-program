import Icon from '../components/Icon'
import { cx } from '../lib/utils'
import { ComposerSearch } from '../components/ChatSearch'
import OutboxNotice from '../components/OutboxNotice'
import { loadDraft } from '../lib/drafts'
import ChatComposer from '../components/ChatComposer'

// Part of Messages.jsx: every value it shows comes in as a prop from the page.
export default function MessagesComposer({
  active,
  activeTitle,
  attachError,
  body,
  closeThreadSearch,
  composerRef,
  connected,
  conversationId,
  dmComposerRef,
  dmDraftKey,
  dmLocked,
  dmMentionNames,
  dmPreview,
  dockRef,
  draftTo,
  farUp,
  hideChrome,
  iSentCount,
  isAdmin,
  isGroup,
  isMobile,
  jumpToLatest,
  kbOpen,
  newBelow,
  onComposerChange,
  otherTyping,
  outboxScope,
  reactorName,
  replyTo,
  send,
  sendAttachment,
  sending,
  setReplyTo,
  setThreadSearch,
  stopTyping,
  theyReplied,
  thread,
  threadSearch,
  threadSearchOpen,
  tr,
  user,
  visibleThread,
}) {
  return (
    <div ref={dockRef} className="shrink-0">
    {/* Typing indicator + jump-to-latest pill float above the composer. */}
    <div className="relative">
      {otherTyping && (
        <div className="pointer-events-none absolute -top-6 left-5 flex items-center gap-1.5 text-xs text-smoke">
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke" />
          </span>
          <span className="italic">
            {(otherTyping.name || active?.other?.name || 'Someone').split(' ')[0]} is typing…
          </span>
        </div>
      )}
      {farUp && (
        <div className="pointer-events-none absolute -top-14 inset-x-0 z-10 flex justify-center">
          <button
            type="button"
            onClick={jumpToLatest}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-lift transition-transform hover:scale-105 active:scale-95"
          >
            {newBelow > 0 ? `${newBelow} new message${newBelow === 1 ? '' : 's'}` : 'Jump to latest'}
            <Icon name="arrow-down" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>

    {/* Composer */}
    {/* `shrink-0`, matching the legacy chat. Without it the composer
        is the only flexible item in the column once the message list
        has taken its `flex-1 basis-0`, so a composer grown to six
        lines is the thing the browser squeezes when the keyboard
        takes half the screen. */}
    <div ref={composerRef} className={cx('shrink-0 border-t border-gray-100', isMobile && threadSearchOpen ? 'px-3 py-2.5' : 'px-5 py-4')}>
      {isMobile && threadSearchOpen ? (
        <ComposerSearch value={threadSearch} onChange={setThreadSearch} count={visibleThread.length} total={thread.length}
          placeholder="Search this conversation" onClose={closeThreadSearch} />
      ) : dmLocked ? (
        <div className="rounded-card bg-cloud px-4 py-3 text-center text-sm text-smoke">
          Message sent. You can send one message until {active?.other?.name?.split(' ')[0]} replies, which connects you.
        </div>
      ) : (
      <>
      <OutboxNotice scope={outboxScope} />
      {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
      {!connected && !isAdmin && iSentCount === 0 && !theyReplied && (
        <p className="mb-2 text-xs text-smoke">You can send one message. If {active?.other?.name?.split(' ')[0]} replies, you’ll be connected.</p>
      )}
      {/* WHAT YOU ARE REPLYING TO. CHARACTER FOR CHARACTER THE ROOMS'.
          The two had drifted into different chips doing the same job:
          this one was a grey bar with a left rule and a BAN icon to
          cancel - a no-entry sign, which reads as "you may not do
          this" rather than "drop this reply". Ethan: "it shows up the
          reply with a circle, like a no entry icon, it should be an x
          to exit out of the reply, the same as it shows on the rooms."
          So it is the rooms' markup: tinted, a reply arrow to say what
          the bar is, and a close cross to leave. */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-tint/40 py-2 pl-3 pr-2">
          <Icon name="reply" className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-brand">
              Replying to {replyTo.sender_id === user.id ? 'yourself' : reactorName(replyTo.sender_id).split(' ')[0]}
            </span>
            <span className="block truncate text-xs text-smoke">{dmPreview(replyTo)}</span>
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label={tr("Cancel reply")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-white hover:text-ink"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}
      <ChatComposer
        ref={dmComposerRef}
        docId={conversationId || (draftTo ? `to-${draftTo.id}` : '')}
        initialMd={loadDraft(dmDraftKey(conversationId, draftTo?.id))}
        placeholder={isMobile
          ? 'Message…'
          : `Message ${isGroup ? activeTitle : (active?.other?.name?.split(' ')[0] ?? '')}…`}
        ariaLabel="Message"
        mentionNames={dmMentionNames}
        onChangeMd={onComposerChange}
        onBlur={stopTyping}
        onSend={send}
        canSend={!!body.trim()}
        sending={sending}
        onAttach={sendAttachment}
        isAdmin={isAdmin}
        onFocus={hideChrome}
        isMobile={isMobile}
        kbOpen={kbOpen}
        className="!border-t-0 !px-0 !py-0"
      />
      </>
      )}
    </div>
    </div>
  )
}
