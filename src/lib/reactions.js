// What you can react with.
//
// There were two of these, six emoji each, defined inline in two files that did
// not know about each other: ['❤️','🔥','😂','👍','🎉','✈️'] in the legacy chat
// and ['👍','🔥','❤️','😂','🎉','👀'] in the network rooms. So the same message
// offered a different vocabulary depending on which room it was in, and in both
// rooms the vocabulary was six words long.
//
// Six is enough to acknowledge a message and not enough to say anything about
// it. This is a travel community: "that is a beautiful shot", "I have been
// there", "take me with you" and "book it" are all things people actually want
// to say to a post, and none of them are 👍.
//
// THE SHAPE. A short row you can hit without thinking, and a fuller set one
// press away, grouped so it can be scanned rather than searched. Deliberately
// NOT a full emoji keyboard: a reaction picker with 1800 options is a decision,
// and the whole point of a reaction is that it is not one.

// The row that shows immediately. Six, because that is what fits on a phone
// next to a message without the popover covering the message.
export const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '🎉', '✈️']

// The full set, grouped. Order within a group is roughly most-used first.
export const REACTION_GROUPS = [
  {
    name: 'Reactions',
    emoji: ['👍', '❤️', '🔥', '😂', '🥹', '😮', '👏', '🙌', '💯', '👀', '🤝', '🫶', '😍', '🤯', '😅', '🙏'],
  },
  {
    // The reason this file exists.
    name: 'Travel',
    emoji: ['✈️', '🌍', '🗺️', '🧳', '📍', '🏝️', '🏔️', '🏙️', '🌅', '🌊', '🛫', '🛬', '🚐', '🚂', '⛵', '🎒', '⛺', '🏄', '🗿', '🧭'],
  },
  {
    name: 'Making it',
    emoji: ['🎬', '📸', '🎥', '🎙️', '✍️', '⭐', '🏆', '🚀', '💡', '✅', '📈', '💰'],
  },
]

// Every emoji the picker can produce, flattened. Used to sanity-check anything
// arriving from the database before it is rendered.
export const ALL_REACTIONS = REACTION_GROUPS.flatMap((g) => g.emoji)
