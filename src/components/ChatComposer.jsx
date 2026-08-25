import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import RichEditable from './RichEditable'
import { ComposerToolbar } from './ComposerTools'
import Icon from './Icon'
import { cx } from '../lib/utils'

// THE COMPOSER. ONE OF THEM.
//
// There were three: a WYSIWYG contentEditable in the legacy chat, and a plain
// one-row textarea in the market rooms and in the DMs. Everything Ethan
// reported about typing came out of that split:
//
//   * "the textbox doesn't get bigger at all" - a `rows={1}` textarea does not
//     grow. Only the DMs had an auto-grow effect, and only the DMs.
//   * "it's showing up like a hashtag instead of the heading" - the textarea
//     composers inserted literal markdown markers. The message RENDERED
//     correctly when sent, which is exactly why it read as broken: you could
//     see the app knew what you meant and was showing you the plumbing anyway.
//   * "sometimes the Aa button is on the left and other times on the right" -
//     two of the three put it beside the send button.
//
// So this is the composer, and the three chats hand it their differences as
// props. A fourth chat built next year gets a growing, formatting, consistent
// composer by importing it rather than by remembering to.
//
// WHY contentEditable AND NOT A TEXTAREA WITH AUTO-GROW. A textarea cannot show
// bold text; it is a plain-text control by definition. Formatting you can see
// while you type is the requirement, so the surface has to be rich. It grows on
// its own for free - a div is as tall as its content - and `max-h-40` +
// `overflow-y-auto` is the cap and the scroll.
//
// `body` stays MARKDOWN either way: RichEditable serialises on every keystroke,
// so drafts, mentions, notification previews and the send path are unchanged.

const ChatComposer = forwardRef(function ChatComposer({
  // Identity of the thread. Changing it reseeds the editor with that room's
  // draft instead of carrying the last room's text into this one.
  docId,
  initialMd = '',
  placeholder = 'Message…',
  ariaLabel = 'Message',
  mentionNames,
  onChangeMd,
  onInput,
  onBlur,
  onKeyDown,
  onSend,
  canSend = false,
  sending = false,
  // Attachments. Omit onAttach and the button is not drawn.
  onAttach = null,
  attachAccept = 'image/*,video/*',
  // Admin tools in the row above.
  isAdmin = false,
  onGame,
  onResource,
  onPoll,
  onSchedule,
  // Layout
  isMobile = false,
  kbOpen = false,
  className,
  // Anything that belongs between the toolbar and the input row: the reply
  // preview, the @-mention menu, an upload error.
  children,
}, ref) {
  const editorRef = useRef(null)
  const [showFormatting, setShowFormatting] = useState(false)
  const fileRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    clear: () => editorRef.current?.clear(),
    getMd: () => editorRef.current?.getMd() ?? '',
    insertMention: (name, back) => editorRef.current?.insertMention(name, back),
    format: (kind) => {
      const ed = editorRef.current
      if (!ed) return
      // Heading is a BLOCK and applies to the line; bold and italic are a RUN
      // and apply to exactly what is selected, half a word included. That
      // asymmetry is not a compromise, it is what the two things are.
      if (kind === 'heading') ed.exec('formatBlock', 'h1')
      else ed.exec(kind)
    },
  }))

  const format = (kind) => {
    const ed = editorRef.current
    if (!ed) return
    if (kind === 'heading') ed.exec('formatBlock', 'h1')
    else ed.exec(kind)
  }

  return (
    <div
      className={cx(
        'shrink-0 border-t border-gray-100 px-4 py-2.5 sm:px-5 sm:py-3',
        // SNUG TO THE KEYBOARD.
        //
        // The safe-area inset is the home indicator's strip at the bottom of the
        // screen. It must be respected when the keyboard is DOWN - otherwise the
        // composer sits under the indicator - and must NOT be when the keyboard
        // is up, because iOS keeps reporting the inset even though the keyboard
        // is covering that strip, which leaves a 34px band of white between the
        // composer and the keys. That band is the reported "not sitting snugly
        // above the keyboard".
        !kbOpen && 'pb-[max(0.625rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <ComposerToolbar
        onFormat={format}
        isAdmin={isAdmin}
        onGame={onGame}
        onResource={onResource}
        onPoll={onPoll}
        onSchedule={onSchedule}
        open={showFormatting}
      />

      {children}

      {onAttach && (
        <input
          ref={fileRef}
          type="file"
          accept={attachAccept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onAttach(f) }}
        />
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); onSend(e) }}
        className="flex items-end gap-2"
      >
        {/* THE LEFT CLUSTER, IN THIS ORDER, EVERYWHERE. Attach then Aa. They are
            both "add something to this message" controls and they belong
            together; send is the only thing on the right because send is the
            only thing that ends the message. */}
        {onAttach && (
          <button
            type="button"
            // blur() so the global focus-visible ring does not stick to the
            // button after the file dialog closes and re-focuses it.
            onClick={(e) => { e.currentTarget.blur(); fileRef.current?.click() }}
            disabled={sending}
            className="btn-ghost shrink-0 !px-2.5 !py-3 disabled:opacity-50"
            aria-label="Attach a photo or video"
            title="Attach a photo or video"
          >
            <Icon name="image" className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowFormatting((v) => !v)}
          aria-pressed={showFormatting}
          aria-label="Formatting"
          className={cx('btn-ghost shrink-0 !px-2.5 !py-3 sm:hidden', showFormatting && '!text-brand')}
        >
          <span className="text-sm font-bold leading-none">Aa</span>
        </button>

        <RichEditable
          ref={editorRef}
          docId={docId}
          initialMd={initialMd}
          inlineOnly
          mentionNames={mentionNames}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChangeMd={onChangeMd}
          onInput={onInput}
          onBlur={onBlur}
          onKeyDown={(e) => {
            // Enter sends on a real keyboard; Shift+Enter is a new line. On a
            // phone Enter is the newline key and there is a send button right
            // there, so it is left alone.
            if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) onSend(e)
              return
            }
            onKeyDown?.(e)
          }}
          // GROWS WITH THE MESSAGE. `max-h-40` is about six lines, after which
          // it scrolls rather than eating the conversation above it. text-base
          // on mobile is deliberate: anything smaller and iOS zooms the page on
          // focus, and the overlay geometry never recovers.
          //
          // `rt-scroll` is what makes that scroll actually work on a phone -
          // see the note in index.css. Without it the drag chains out to the
          // locked document behind the overlay and takes the keyboard with it.
          className="input rt-scroll max-h-40 min-h-[2.75rem] flex-1 self-stretch overflow-y-auto overscroll-contain py-2.5 text-base sm:text-sm"
        />

        <button
          type="submit"
          // Prevent the tap from moving focus off the editor - that blur is what
          // collapsed the keyboard on send.
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canSend || sending}
          className="btn-primary shrink-0 !px-5"
          aria-label="Send"
        >
          {sending ? (
            <span className="text-sm">…</span>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h6" />
            </svg>
          )}
        </button>
      </form>
    </div>
  )
})

export default ChatComposer
