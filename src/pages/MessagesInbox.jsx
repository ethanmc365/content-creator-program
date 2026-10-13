import { formatChatTime, cx } from '../lib/utils'
import Icon from '../components/Icon'
import { GroupAvatar } from '../components/GroupPanels'
import { Avatar, Badge, EmptyState, Skeleton } from '../components/ui'
import { Link } from 'react-router-dom'
import Reveal from '../components/network/Reveal'
import { groupName } from '../lib/groups'

// Part of Messages.jsx: every value it shows comes in as a prop from the page.
export default function MessagesInbox({
  answerInvite,
  cancelConvPress,
  convLongPressed,
  convSheet,
  conversationId,
  conversations,
  discover,
  discoverPeople,
  invites,
  loadingList,
  myConnections,
  navigate,
  openConvMenu,
  personRow,
  pinned,
  q,
  search,
  searchMatches,
  setSearch,
  setShowNewGroup,
  shownConversations,
  startConvPress,
  threadOpen,
  togglePin,
  tr,
  user,
}) {
  return (
    <aside
      className={cx(
        'w-full shrink-0 flex-col border-r border-gray-100 sm:flex sm:w-80',
        threadOpen ? 'hidden' : 'flex'
      )}
      aria-label={tr("Conversations")}
    >
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">{tr("Messages")}</h1>
          {/* Starting a group is a different intent from finding a person,
              so it is a different control. Folding it into the search box
              ("type a name…") would mean the only way to discover groups
              exist is to already know. */}
          <button
            type="button"
            onClick={() => setShowNewGroup(true)}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
          >
            <Icon name="users" className="h-3.5 w-3.5" /> {tr("New group")}
          </button>
        </div>
        {/* Search doubles as the "new message" entry point: type a name to
            filter your threads and to start a fresh one with anyone in the
            community, instead of scrolling the inbox to find them. */}
        <div className="relative mt-3">
          <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Search creators…")}
            aria-label={tr("Search creators to message")}
            className="input !py-2.5 !pl-9 !pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={tr("Clear search")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-smoke hover:bg-cloud hover:text-ink"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* GROUP INVITES SIT ABOVE THE INBOX.
            An invite is the one thing here that expires socially: a group
            gets going in its first day or it never does. Putting it in the
            notification list and nowhere else means it is answered by
            whoever happens to check notifications, which is not everybody. */}
        {invites.length > 0 && !q && (
          <div className="border-b border-gray-100 bg-brand-tint/25 px-3 py-3">
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
              Group invite{invites.length === 1 ? '' : 's'}
            </p>
            <div className="space-y-1.5">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
                  <GroupAvatar conversation={i.conversations} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.conversations?.title || 'A group'}</p>
                    <p className="truncate text-xs text-smoke">
                      {i.inviter?.name?.split(' ')[0] ?? 'Someone'} invited you
                    </p>
                  </div>
                  <button type="button" onClick={() => answerInvite(i, true)}
                    className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs">{tr("Join")}</button>
                  <button type="button" onClick={() => answerInvite(i, false)} aria-label={tr("Decline invite")}
                    className="shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {loadingList && (
          <div className="space-y-4 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-40" /></div></div>
            ))}
          </div>
        )}

        {/* Nothing in the inbox: rather than a dead end, offer the people
            you're already connected to. Someone who hasn't connected with
            anyone yet gets creators who are active in the community. */}
        {!loadingList && conversations.length === 0 && !q && (
          <div className="p-5">
            <div className="rounded-card border border-gray-100 bg-white px-4 py-4 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand" aria-hidden>
                <Icon name="envelope" className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold">{tr("No messages yet")}</p>
              <p className="mt-1 text-xs leading-relaxed text-smoke">
                {myConnections.length > 0
                  ? 'Say hi to one of your connections. A quick hello is how most collabs start.'
                  : 'Say hi to someone new. A quick hello is how most collabs start.'}
              </p>
            </div>

            {/* THE SAME SIX PEOPLE THE BIG PANE OFFERS, AND THE SAME HEADING RULE. This list used to be
                `emptyStatePeople` - your own connections - which meant a phone, where the big pane never renders,
                offered a different answer to the same question from the one a laptop gave. Two lists is how the two
                screens drift; `discover` is the one definition of "who should I talk to". */}
            {!discover.loading && discoverPeople.length > 0 && (
              <div className="mt-4">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {discover.mode === 'new' ? tr('Connect with someone new') : tr('Say hello to someone')}
                </p>
                <div className="space-y-0.5">
                  {discoverPeople.map((p) => personRow(p, discover.strangerIds?.has(p.id) ? 'You have not met yet' : 'Send a hello'))}
                </div>
              </div>
            )}

            <Link to="/creators" className="mt-4 block text-center text-xs font-semibold text-brand hover:underline">
              {tr("Browse all creators")}
            </Link>
          </div>
        )}

        {/* Search found nothing at all. */}
        {!loadingList && q && shownConversations.length === 0 && searchMatches.length === 0 && (
          <div className="p-5">
            <EmptyState
              icon={<Icon name="magnifier" className="h-7 w-7" />}
              title={tr("No creators found")}
              hint={tr("Try a different name.")}
            />
          </div>
        )}

        {/* THE INBOX ARRIVES, AND THIS TIME IT ACTUALLY DOES. Every other list in the app rises into view one row after
            another. There was already a `Reveal` here and it did nothing, which is the team's "all the open messages and
            people you've messaged just flash up on the left hand side rather than smoothly load and animate in from top
            to bottom".

            WHY IT DID NOTHING. `Reveal` marks itself `is-in` the moment its
            container is on screen - and the sidebar is at the top of the
            page, so that happened on the FIRST frame, while the list was
            still empty and waiting on the query. The rows arrived into a
            container that was already `is-in`, so they were rendered with
            the finished state applied and never had a starting frame to
            transition FROM. An entrance animation needs the element to
            exist before it arrives.

            The `key` fixes it by remounting the container the moment the
            list stops loading: a fresh Reveal, children present from its
            first frame, observer fires, everything staggers in.

            Tight stagger (35ms) because these are dense rows, not cards -
            past about 45ms a list stops reading as arriving and starts
            reading as slow. */}
        {/* `dense`: an inbox of twenty rows carrying twenty avatars is the
            list this variant exists for. See the prop in Reveal. */}
        <Reveal dense key={loadingList ? 'inbox-loading' : 'inbox-ready'} className="flex flex-col" stagger={0.035}>
        {shownConversations.map((c) => (
          // A ROW IS A BUTTON, SO THE PIN CANNOT BE ONE INSIDE IT.
          // Nesting a <button> in a <button> is invalid HTML and React will
          // say so; browsers resolve it by dropping the inner one, which
          // means the pin would render and never fire. The row is a div
          // with a click handler and the pin is a real button on top of it.
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => { if (convLongPressed.current) { convLongPressed.current = false; return } navigate(`/messages/${c.id}`, { state: { fromInbox: true } }) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/messages/${c.id}`, { state: { fromInbox: true } }) } }}
            onTouchStart={(e) => startConvPress(c, e.currentTarget)} onTouchEnd={cancelConvPress} onTouchMove={cancelConvPress}
            onMouseDown={(e) => startConvPress(c, e.currentTarget)} onMouseUp={cancelConvPress} onMouseLeave={cancelConvPress}
            onContextMenu={(e) => { e.preventDefault(); openConvMenu(c, e.currentTarget) }}
            className={cx(
              // `hoverable:` - A ROW WITH A `:hover` RULE COSTS YOU THE
              // FIRST TAP ON iOS. Safari treats the first tap on an element whose appearance changes on hover as the
              // hover, and only the second one as the click; the row lights up grey and nothing opens. The same rule is
              // why the grey then STAYS: there is no pointer to move away. The `hoverable` variant is `(hover: hover)
              // and (pointer: fine)`, so the style simply does not exist on a phone.
              'group/conv relative flex w-full cursor-pointer select-none items-center gap-3 px-5 py-4 text-left transition-colors hoverable:hover:bg-cloud',
              // A press still gives feedback on touch - it is just tied to
              // the finger being down rather than to a hover that never
              // ends.
              'active:bg-cloud/70',
              c.id === conversationId && 'bg-brand-tint/50',
              // ROUNDED WHEN HELD. The orange hold state is a rounded tile, not a full-bleed square band.
              convSheet?.id === c.id && '!bg-brand-tint rounded-2xl ring-2 ring-inset ring-brand/40',
            )}
          >
            {c.kind === 'group'
              ? <GroupAvatar conversation={c} members={c.members} />
              : <Avatar src={c.other?.photo_url} name={c.other?.name} size="md" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className={cx('truncate text-sm font-semibold transition-colors', convSheet?.id === c.id && 'text-brand')}>
                  {c.kind === 'group' ? groupName(c, c.members, user.id) : (c.other?.name ?? 'Creator')}
                </p>
                {c.kind === 'group'
                  ? <Badge tone="light" className="!px-2 !py-0">{c.members?.length ?? 0}</Badge>
                  : c.other?.is_admin && <Badge tone="light" className="!px-2 !py-0">{tr("Tryp.com")}</Badge>}
              </div>
              <p className="truncate text-xs text-smoke">{formatChatTime(c.last_message_at)}</p>
            </div>
            {c.unread > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">
                {c.unread}
              </span>
            )}

            {/* THE PIN. Top-right, on hover - and PERMANENTLY VISIBLE once
                the chat is pinned, because a state you can only see by
                hovering is a state that does not exist on a phone. It is
                also the only affordance that says pinning is possible at
                all, so it appears on focus as well as hover. */}
            <button
              type="button"
              onClick={(e) => togglePin(e, c)}
              aria-label={pinned.includes(c.id) ? 'Unpin this chat' : 'Pin this chat to the top'}
              title={pinned.includes(c.id) ? 'Unpin' : 'Pin to the top'}
              className={cx(
                'absolute right-2 top-2 rounded-full p-1.5 transition-all',
                pinned.includes(c.id)
                  // An ALREADY pinned chat shows its pin at every width -
                  // a state you can only see by hovering is a state that
                  // does not exist on a phone.
                  ? 'text-brand opacity-100'
                  // AND THIS IS WHY THE FIRST TAP ON A DM DID NOTHING.
                  //
                  // Exactly that. The row itself was already careful to put
                  // its hover behind `hoverable:` for this precise reason -
                  // iOS spends the first tap on an element whose appearance
                  // changes on hover, and only the second on the click -
                  // but this button's `group-hover/conv:` was UNPREFIXED,
                  // so the row still had a hover-sensitive descendant and
                  // Safari still charged a tap for it.
                  //
                  // `hoverable:` is `(hover: hover) and (pointer: fine)`,
                  // so on a phone these styles do not exist at all and the
                  // first tap opens the chat. Pinning is reachable there by
                  // holding the row - see the sheet below.
                  : 'text-gray-300 opacity-0 hoverable:hover:bg-white hoverable:hover:text-brand hoverable:focus-visible:opacity-100 hoverable:group-hover/conv:opacity-100',
              )}
            >
              <Icon name="pin" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        </Reveal>

        {/* People matching the search that you haven't messaged before:
            tapping one opens a brand new thread with them. */}
        {searchMatches.length > 0 && (
          <div className="px-2 pb-4 pt-2">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {tr("Start a new chat")}
            </p>
            <div className="space-y-0.5">
              {searchMatches.map((p) => personRow(p))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
