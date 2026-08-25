// THE OUTBOX. A message written with no signal is still a message.
//
// The Piccadilly line, a lift, a plane on the stand, a hotel corridor in
// Lisbon: you type, you press send, and the app quietly loses it. Every one of
// those is a normal minute of a creator's day, and until now the only thing
// that happened was a grey bubble and a red "Couldn't send" that you had to be
// looking at the screen to see. This holds the message instead and posts it the
// moment the connection comes back.
//
// ONE MODULE, THREE SURFACES. The legacy UK chat, the market rooms and the DMs
// all send a row into a table and all three want exactly this behaviour. The
// notifications work was written three times for those same three surfaces and
// the third copy is still drifting away from the first; that is not happening
// again. Everything a send needs - which table, which row, what to select back
// - travels ON the queued item, so this file never learns what a "channel" or
// a "conversation" is.
//
// WHY LOCALSTORAGE AND NOT MEMORY. A tunnel usually means the app is
// backgrounded, and a backgrounded tab on iOS is a tab the OS is entitled to
// kill. An outbox that lives in a React state only survives the situation it
// was built for by luck. So the queue is written to disk on every change, and
// it is written BEFORE the first attempt rather than after the first failure -
// if the send would have worked, the item is gone a few milliseconds later and
// nobody paid anything for the insurance.
//
// WHY navigator.onLine IS NOT THE TRIGGER. It reports true on a captive portal,
// true on a connection that resolves nothing, and on some Androids it never
// flips at all for a cell handover. It is a hint, never a gate. Nothing here
// asks whether we are online: we flush on every plausible occasion and let a
// failed request be the answer.

const KEY = 'tryp_outbox_v1'

// A rejection is the server having an opinion, and an opinion rarely improves
// on the fourth reading. Three goes covers a transient 5xx and stops well short
// of hammering a row that RLS is never going to accept.
const MAX_REJECTIONS = 3

// The other kind of failure - nobody answered - is not the message's fault and
// gets no attempt counted against it, because a tunnel that lasts four minutes
// would otherwise burn the budget in the first ninety seconds and throw the
// message away while the person is still underground. What bounds it instead is
// age: after a day, a "quick" reply has stopped being one, and sending it
// without asking would be its own small betrayal.
const MAX_AGE_MS = 24 * 60 * 60 * 1000

// While anything is waiting, try again on a timer as well. This is the case
// 'online' does not cover: if the browser never noticed it went offline, it
// never fires the event that says it came back.
const RETRY_MS = 15000

// Enough to hold a conversation's worth of backlog, small enough that a broken
// tab cannot fill somebody's storage quota with rows nobody will ever read.
const MAX_ITEMS = 50

let items = read()
let sender = defaultSender
const changeListeners = new Set()
const sentListeners = new Set()

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

function write(next) {
  items = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* quota / private mode */ }
  for (const fn of changeListeners) fn(next)
}

/** A queued message's id, which is also the id its optimistic bubble renders
 *  under. One id for the whole life of the send is what makes the reconcile
 *  exact instead of a guess about matching bodies. Generated here rather than
 *  in a component because `react-hooks/purity` bans Date.now/Math.random from a
 *  render, and a send handler is close enough to one to be worth not arguing. */
export function newOutboxId() {
  return `out-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Everything still waiting for a given thread, oldest first. */
export function queuedFor(scope) {
  return items.filter((i) => i.scope === scope)
}

/** Told when the queue changes, for the composer's waiting indicator. */
export function subscribeOutbox(fn) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

/** Told when an item lands, with the real row the database gave back, so the
 *  surface can put the true message where the pending one was. */
// Told when a message was refused because the sender is the preview sandbox.
const blockedListeners = new Set()
export function onOutboxBlocked(fn) {
  blockedListeners.add(fn)
  return () => blockedListeners.delete(fn)
}

export function onOutboxSent(fn) {
  sentListeners.add(fn)
  return () => sentListeners.delete(fn)
}

/**
 * Queue a message and try it immediately. The immediate try is the ordinary
 * path - with signal this resolves in the usual 200ms and the queue was never
 * more than a bookkeeping detour.
 *
 * @param {object} p
 * @param {string} p.scope   Which thread this belongs to (channel key, conversation id).
 * @param {string} p.table   'messages' | 'direct_messages'
 * @param {object} p.row     Exactly what goes into .insert()
 * @param {string} p.select  What to select back, so the surface gets a usable row
 * @param {object} p.display The optimistic bubble: a full message row, joins and all
 */
export function enqueueMessage({ scope, table, row, select = '*', display }) {
  const id = newOutboxId()
  const item = {
    id,
    scope,
    table,
    row,
    select,
    display: { ...display, id },
    createdAt: Date.now(),
    tries: 0,
    rejections: 0,
    failed: false,
  }
  write([...items, item].slice(-MAX_ITEMS))
  flushOutbox()
  return item
}

/** Give a given-up message another go, by hand, because somebody asked. */
export function retryQueued(id) {
  write(items.map((i) => (i.id === id ? { ...i, failed: false, rejections: 0, createdAt: Date.now() } : i)))
  return flushOutbox()
}

/** Throw a message away. The only way out of the queue that is not a send. */
export function dropQueued(id) {
  write(items.filter((i) => i.id !== id))
}

// A PostgREST error always carries a `code`; a fetch that never reached a
// server carries nothing but a message. That difference is the whole
// classification: "the server said no" versus "there was no server". Getting it
// wrong in the safe direction only means a message waits longer than it had to.
function wasRejected(error) {
  return !!(error && (error.code || error.status))
}

async function defaultSender(item) {
  const { supabase } = await import('./supabase')
  return supabase.from(item.table).insert(item.row).select(item.select).single()
}

// ONE FLUSH AT A TIME, NO MATTER HOW MANY THINGS ASK FOR ONE. 'online' and
// 'visibilitychange' fire within a few milliseconds of each other on a phone
// coming out of a tunnel, and two flushes racing over the same queue is how you
// send the same message twice. Callers all share the in-flight promise, and an
// item leaves the queue only after the database has confirmed the insert - so
// even a flush killed halfway sends again rather than losing anything.
let flushing = null

export function flushOutbox(now = Date.now()) {
  if (flushing) return flushing
  flushing = runFlush(now).finally(() => { flushing = null })
  return flushing
}

async function runFlush(now) {
  for (const queued of items.filter((i) => !i.failed)) {
    // Re-read every time: a send is a round trip, and the item may have been
    // dropped or already sent while this loop was waiting on the last one.
    const item = items.find((i) => i.id === queued.id)
    if (!item || item.failed) continue

    if (now - item.createdAt > MAX_AGE_MS) { markFailed(item.id); continue }

    // A thrown fetch and a returned `{ error }` are the same event wearing
    // different clothes; supabase-js will do either depending on where the
    // connection died.
    let result
    try { result = await sender(item) } catch (err) { result = { error: err } }
    const { data, error } = result ?? {}

    if (!error) {
      // Off the queue FIRST, then tell the surface. The other order leaves a
      // window where the real row is on screen and the pending copy still is
      // too, which is the double-message this is supposed to prevent.
      write(items.filter((i) => i.id !== item.id))
      for (const fn of sentListeners) fn(item, data)
      continue
    }

    // THE SANDBOX IS NOT ALLOWED TO SPEAK, and that is not a failure to retry.
    //
    // "View as creator" drops an admin into a sandbox account that the database
    // refuses to let post, so an admin who forgets which account they are in
    // cannot put words in an invented creator's mouth. Retrying that four times
    // and then showing a red "failed" bubble would be the app arguing with a
    // rule it agrees with. Drop it and say what happened.
    if (String(error?.message || '').includes('SANDBOX_CANNOT_POST')) {
      write(items.filter((i) => i.id !== item.id))
      for (const fn of blockedListeners) fn(item)
      continue
    }

    if (wasRejected(error)) {
      const rejections = item.rejections + 1
      patch(item.id, { tries: item.tries + 1, rejections, failed: rejections >= MAX_REJECTIONS })
      continue
    }

    // `tries` counts nothing except what the bubble is allowed to say. A
    // message that has been asked for once and got silence is a message
    // WAITING, and saying "Sending" at it for the next twenty minutes is the
    // kind of small dishonesty this whole feature exists to stop.
    patch(item.id, { tries: item.tries + 1 })

    // Nobody answered. Stop the loop rather than working down the queue: the
    // connection has not come back, and the only thing the remaining messages
    // would gain from being tried now is a worse position in the order they
    // were written in.
    break
  }
}

function patch(id, fields) {
  write(items.map((i) => (i.id === id ? { ...i, ...fields } : i)))
}

function markFailed(id) {
  patch(id, { failed: true })
}

/**
 * Start listening for the moments a connection tends to come back. Idempotent,
 * mounted once for the whole app, and it flushes on the way in because the tab
 * may have been killed with something still queued.
 */
let stop = null
export function startOutbox() {
  if (typeof window === 'undefined') return () => {}
  if (stop) return stop

  const onOnline = () => flushOutbox()
  // The one that actually fires on a phone. 'online' needs the browser to have
  // noticed the loss in the first place; coming back to the tab is observable
  // whatever the network stack believed.
  const onVisible = () => { if (document.visibilityState === 'visible') flushOutbox() }
  const tick = () => { if (items.some((i) => !i.failed)) flushOutbox() }

  window.addEventListener('online', onOnline)
  window.addEventListener('focus', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const iv = setInterval(tick, RETRY_MS)
  flushOutbox()

  stop = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('focus', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(iv)
    stop = null
  }
  return stop
}

// ---- test seams -------------------------------------------------------
// Same shape as confirm.js and toast.js: the module owns the behaviour, a
// setter lets a test stand in for the one thing that talks to the network.
export function _setOutboxSender(fn) { sender = fn || defaultSender }
export function _resetOutbox() {
  flushing = null
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  write([])
  changeListeners.clear()
  sentListeners.clear()
}
