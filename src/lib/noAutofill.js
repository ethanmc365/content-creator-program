// STOP THE PHONE OFFERING SOMEBODY'S HOME ADDRESS.
//
// THE BUG. Typing into the airport field on an iPhone put a bar above the
// keyboard offering "Home - 14 Somewhere Road" and "Work - ...". Ethan, logging
// a flight: "it's showing up suggestions just above my keyboard saying home and
// my home address and work and my work address, and it shouldn't be showing up
// out of full contact because this is not something you're auto filling your
// contact for."
//
// WHY `autocomplete="off"` ON ITS OWN DID NOT DO IT. The airport field already
// had it. WebKit treats `off` as advice rather than instruction on any field its
// own heuristics have classified as part of an address: the classifier reads the
// name, the id, the label and the PLACEHOLDER, and that field's placeholder was
// "Code or city, e.g. LIS or Lisbon". The word "city" is all it takes.
//
// WHAT ACTUALLY WORKS is doing all of it at once:
//
//   - `type="search"` where the field really is a search. Safari does not offer
//     contact AutoFill on a search field, and this is the single most reliable
//     part of the set.
//   - `autoComplete="off"` for every other browser, which does honour it.
//   - `autoCorrect`, `autoCapitalize` and `spellCheck` off. These are not the
//     AutoFill bar, they are the OTHER thing iOS does to a text field:
//     "LIS" autocorrected to "LIST", "ryanair" capitalised, a red squiggle under
//     an airport name. On a field full of codes and proper nouns every one of
//     those is wrong.
//   - `data-1p-ignore` / `data-lpignore`, which are how 1Password and LastPass
//     are told to keep their icon out of a field that holds no credential.
//
// WHERE NOT TO USE IT: anywhere autofill is a KINDNESS. Sign-in, the password
// fields, the payment and payee details in Settings, a real address. Those want
// correct `autocomplete` tokens (`email`, `current-password`, `street-address`),
// not silence. This is only for the fields that hold codes, names of aircraft,
// notes and search queries - things no address book has ever contained.

/** Spread onto a plain text input that should never be autofilled. */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': '',
  'data-lpignore': 'true',
}

/**
 * The same, for a field that is genuinely a search box. `type="search"` is what
 * keeps Safari's contact bar away, so prefer this wherever it is honest.
 */
export const NO_AUTOFILL_SEARCH = { ...NO_AUTOFILL, type: 'search' }
