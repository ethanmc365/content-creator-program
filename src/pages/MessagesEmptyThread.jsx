import { Avatar, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { Link } from 'react-router-dom'

// Part of Messages.jsx: every value it shows comes in as a prop from the page.
export default function MessagesEmptyThread({ discover, discoverPeople, newHereCutoff, startConversation, starting, tr }) {
  return (
    <div className="flex h-full flex-col justify-center overflow-y-auto p-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* THE HEADING IS TITLE CASE AND IT NAMES THE LIST UNDER IT.

            Both sentences are here because they are two different
            screens, and which one you get is decided by the same memo
            that picks the faces (`discover`). A heading that is a
            constant over a list that is not is how the pane came to
            invite somebody to "connect with" people they were already
            connected to.

            NO EXPLANATORY LINE, still: the heading says what to do and the cards say who with. The sub-line here is the
            one thing neither of them can say - WHY these six. */}
        <p className="text-center text-xl font-bold tracking-tight sm:text-2xl">
          {discover.mode === 'new' ? tr('Connect With Someone New') : tr('Say Hello to Someone')}
        </p>

        {/* WHILE THE QUERY IS OUT, THE PANE HOLDS ITS SHAPE AND SAYS
            NOTHING ELSE. Six tiles of the right size, so the heading
            does not jump when the faces arrive, and no sentence -
            because every sentence this pane can say is a claim about a
            list nobody has read yet. */}
        {discover.loading ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2 rounded-card border border-gray-100 px-3 py-5">
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="mt-0.5 h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : discoverPeople.length > 0 ? (
          <>
            {/* NO SUB-LINE.

                It was three sentences behind one ternary, which made it the last thing on this pane whose WORDING
                depended on a count that changes as queries land - the visible half of the flash they reported in the
                same breath. And it was restating the heading above it and the badges below it: the cards already say
                "Not met" or "New here" on the people it was describing. */}
            {/* CARDS, NOT A BORDERED TABLE OF ROWS. The list was two
                columns of full-width rows inside one boxed card, which
                put a hairline grid across the middle of the largest
                empty space in the product - the same "weird lines"
                problem the wrapped pills had before it.

                THE FACE LEADS AND THE CARD IS A TILE. Six rows of avatar + name in two columns is an address book; what
                this pane is for is recognising a face and pressing it. So the photo is the top of the card at 56px, the
                name sits under it, and three go across on a wide pane - which is also what makes six of them read as six
                rather than as "two creators", which is what a two-column grid of six looks like at a glance. */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discoverPeople.map((p, i) => {
                const isNew = p.created_at && new Date(p.created_at).getTime() > newHereCutoff
                const where = [p.city, p.country].filter(Boolean).join(', ')
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => startConversation(p.id)}
                    disabled={starting === p.id}
                    /* They arrive one after another rather than all at
                       once. `animate-fade-up` is the same CSS entrance
                       the auth card and the hero use, so this is the
                       product's own movement and not a new one - and it
                       is CSS because this pane is inside an eagerly
                       routed page. */
                    className="group animate-fade-up relative flex flex-col items-center gap-2 overflow-hidden rounded-card border border-gray-100 bg-white px-3 py-5 text-center shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/30 hover:shadow-lift disabled:opacity-60"
                    style={{ animationDelay: `${0.05 + i * 0.05}s` }}
                  >
                    {/* THE BADGE SAYS WHICH KIND OF PERSON THIS IS, and
                        that is what makes a topped-up list legible
                        rather than a fudge: strangers lead, people you
                        already know follow, and you can tell them apart
                        without reading the heading. "New here" beats
                        "not connected" on a card whose whole job is to
                        be inviting, so a recent joiner gets that and
                        everybody else you have not met gets the plainer
                        one. */}
                    {discover.strangerIds?.has(p.id) && (
                      <span className="absolute right-2 top-2 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                        {isNew ? tr('New here') : tr('Not met')}
                      </span>
                    )}
                    <Avatar src={p.photo_url} name={p.name} size="lg" />
                    <span className="min-w-0 max-w-full">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-smoke">{where || p.bio || tr('In the community')}</span>
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-cloud px-3 py-1 text-[11px] font-semibold text-smoke transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                      {starting === p.id
                        ? <Spinner className="h-3 w-3" />
                        : <><Icon name="envelope" className="h-3 w-3" />{tr('Message')}</>}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-smoke">
            {tr('Open a conversation from the list, or find somebody new in the directory.')}
          </p>
        )}

        <Link to="/creators" className="mt-5 block text-center text-xs font-semibold text-brand hover:underline">
          {tr('Browse all creators')}
        </Link>
      </div>
    </div>
  )
}
