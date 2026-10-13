import { ComposerSearch } from '../components/ChatSearch'
import Icon from '../components/Icon'
import OutboxNotice from '../components/OutboxNotice'
import { loadDraft } from '../lib/drafts'
import ChatComposer from '../components/ChatComposer'
import IntroInvite from '../components/network/IntroPrompt'
import { AnimatePresence } from 'motion/react'
import { MentionMenu } from '../components/network/ChatExtras'

// Part of NetworkChat.jsx: every value it shows comes in as a prop from the page.
export default function NetworkChatComposerDock({
  active,
  attach,
  attachError,
  body,
  canPost,
  closeStripSearch,
  community,
  composerRef,
  dockRef,
  draftKey,
  hideChrome,
  isAdmin,
  isMobile,
  kbOpen,
  members,
  mention,
  mentionNames,
  messages,
  onComposerChange,
  onComposerInput,
  outboxScope,
  pickMention,
  replyTo,
  search,
  send,
  sending,
  setAdminTool,
  setMention,
  setReplyTo,
  setSearch,
  stripSearch,
  tr,
  user,
  visible,
}) {
  return (
    <div ref={dockRef} className="shrink-0">
    {/* THE COMPOSER IS NOT ON SCREEN WHILE YOU ARE SEARCHING.
        Ethan: "it shows up the messaging bar which it shouldn't in that case
        because I would be typing into the search bar, not the message box."
        Two text fields on one phone screen, one of them focused and the other
        holding a keyboard's worth of chrome under the results you are trying
        to read. `stripSearch` is the phone's search - the desktop bar is a
        different control and does not do this - so this only ever applies
        where the space is actually contested. */}
    {stripSearch ? (
      <div className="shrink-0 border-t border-gray-100 px-3 py-2.5 lg:hidden">
        <ComposerSearch value={search} onChange={setSearch} count={visible.length} total={messages.length}
          placeholder="Search this room" onClose={closeStripSearch} />
      </div>
    ) : !canPost ? (
      <div className="shrink-0 border-t border-gray-100 p-3">
        <p className="flex items-center justify-center gap-2 rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
          <Icon name="bell" className="h-4 w-4 shrink-0" />
          Only the team posts in {active?.label}. Everyone can read it.
        </p>
      </div>
    ) : (
      <>
      <div className="shrink-0 px-3 pt-3">
        <OutboxNotice scope={outboxScope} />
      </div>
      <ChatComposer
        ref={composerRef}
        docId={`${community.id}:${active?.key}`}
        initialMd={loadDraft(draftKey)}
        // A one-row composer cannot show a placeholder that wraps, and at
        // 375px "Message Introductions" wrapped and had its second line sliced
        // off - which reads as broken before you have typed anything.
        placeholder={isMobile ? 'Message' : `Message ${active?.label}`}
        ariaLabel={`Message ${active?.label}`}
        mentionNames={mentionNames}
        onChangeMd={onComposerChange}
        onInput={onComposerInput}
        // Typing is reading's twin here: both want the screen.
        onFocus={hideChrome}
        onSend={send}
        canSend={!!body.trim()}
        sending={sending}
        onAttach={attach}
        isAdmin={isAdmin}
        onGame={() => setAdminTool('game')}
        onPoll={() => setAdminTool('poll')}
        onSchedule={() => setAdminTool('schedule')}
        isMobile={isMobile}
        kbOpen={kbOpen}
        bottomInsetHandled={isMobile}
      >
        {/* WHAT YOU ARE REPLYING TO, WHILE YOU TYPE IT.
            Above the composer and inside it, so it moves with the composer on
            a phone where the whole thing is pinned to the visual viewport.
            Escape and the X both clear it; sending clears it too. */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-tint/40 py-2 pl-3 pr-2">
            <Icon name="reply" className="h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-brand">
                Replying to {replyTo.sender_id === user?.id ? 'yourself' : (replyTo.profiles?.name || 'someone')}
              </span>
              <span className="block truncate text-xs text-smoke">
                {(replyTo.body || '').replace(/\s+/g, ' ').trim()
                  || (replyTo.image_url ? 'Photo' : replyTo.video_url ? 'Video' : 'Message')}
              </span>
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

        {/* THE INTRO INVITATION, IN THE ROOM ITS ANSWER GOES TO.
            It renders nothing anywhere else and nothing once the creator has
            posted an introduction. It opens itself once a session as a card
            over the room; dismiss it and this stays as the way back in. */}
        <IntroInvite community={community} channel={active} canPost={canPost} />

        {attachError && (
          <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{attachError}</p>
        )}
        {/* @-autocomplete, anchored above the composer. */}
        <AnimatePresence>
          {mention && (
            <MentionMenu
              query={mention.query}
              members={members}
              isAdmin={isAdmin}
              onPick={pickMention}
              onClose={() => setMention(null)}
            />
          )}
        </AnimatePresence>
      </ChatComposer>
      </>
    )}
    </div>
  )
}
