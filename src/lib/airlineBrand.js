// WHAT AN AIRLINE LOOKS LIKE, WITHOUT SHIPPING 172 TRADEMARK FILES.
//
// Ethan: "where it says airline loyalty where it currently shows 1,2,3 we don't
// need that because it's already filtered and has the number of times you fly
// on the right side, so change the 1,2,3 to the airline logo instead."
//
// He is right that the rank badge is dead weight - a list already reads top to
// bottom and the flight count is on the same row. What replaces it needs care
// though, because "the airline logo" as a literal instruction runs into two
// walls at once:
//
//   THE CSP. vercel.json sets `img-src 'self'`, so a logo CDN is simply blocked
//   in production. Every mark would have to be downloaded into public/ - 172
//   files, each one somebody's trademark, each one needing checking.
//
//   THE COLOURS ARE THE RECOGNITION ANYWAY. Ryanair is navy and yellow, easyJet
//   is orange, Aer Lingus is green with a shamrock. At the size this sits at -
//   a 28px circle in a list row - the wordmark is unreadable and the colour is
//   doing all of the work.
//
// So: a TAIL FIN in the airline's own livery colours, carrying its IATA code.
// It is the shape you actually look for down the side of an aircraft, it needs
// no network, and it reproduces nobody's logo.
//
// A COLOUR IS ONLY LISTED WHEN IT IS KNOWN. An airline missing from this map
// falls back to the brand tint rather than to a guess, because a confidently
// wrong colour reads worse than a neutral one - it says "that is not my
// airline" to somebody who flies it every week.
//
// { fin, ink } - the fin colour and what reads on top of it.
const BRAND = {
  // ---- UK & Ireland
  BA: { fin: '#075aaa', ink: '#ffffff' },
  VS: { fin: '#e10a0a', ink: '#ffffff' },
  U2: { fin: '#ff6600', ink: '#ffffff' },
  FR: { fin: '#073590', ink: '#f1c933' },
  EI: { fin: '#00a04a', ink: '#ffffff' },
  BE: { fin: '#e4022d', ink: '#ffffff' },
  LS: { fin: '#e4022d', ink: '#ffffff' },
  LM: { fin: '#0a2f6b', ink: '#ffffff' },
  GR: { fin: '#f0b323', ink: '#1c1c1c' },
  SI: { fin: '#0a4f9c', ink: '#ffffff' },
  WX: { fin: '#00a04a', ink: '#ffffff' },
  // ---- Western Europe
  W6: { fin: '#c6017e', ink: '#ffffff' },
  IB: { fin: '#d7192d', ink: '#ffffff' },
  VY: { fin: '#f2c500', ink: '#1c1c1c' },
  UX: { fin: '#004b93', ink: '#ffffff' },
  NT: { fin: '#0d8b45', ink: '#ffffff' },
  YW: { fin: '#004b93', ink: '#ffffff' },
  V7: { fin: '#7a2c8f', ink: '#ffffff' },
  TP: { fin: '#00a04a', ink: '#ffffff' },
  S4: { fin: '#0a6cb2', ink: '#ffffff' },
  AF: { fin: '#002157', ink: '#ffffff' },
  TO: { fin: '#00a04a', ink: '#ffffff' },
  HV: { fin: '#00a04a', ink: '#ffffff' },
  A5: { fin: '#002157', ink: '#ffffff' },
  SS: { fin: '#e4022d', ink: '#ffffff' },
  BF: { fin: '#0a3d91', ink: '#ffffff' },
  TX: { fin: '#0088ce', ink: '#ffffff' },
  UU: { fin: '#e4022d', ink: '#ffffff' },
  XK: { fin: '#c8102e', ink: '#ffffff' },
  KL: { fin: '#00a1de', ink: '#ffffff' },
  SN: { fin: '#0a2f6b', ink: '#ffffff' },
  LX: { fin: '#d0021b', ink: '#ffffff' },
  WK: { fin: '#e4022d', ink: '#ffffff' },
  '2L': { fin: '#c8102e', ink: '#ffffff' },
  LG: { fin: '#003da5', ink: '#ffffff' },
  LH: { fin: '#05164d', ink: '#f0c33c' },
  EW: { fin: '#8c1c6c', ink: '#ffffff' },
  DE: { fin: '#f5d000', ink: '#1c1c1c' },
  OS: { fin: '#d0021b', ink: '#ffffff' },
  AZ: { fin: '#00205b', ink: '#ffffff' },
  EN: { fin: '#00205b', ink: '#ffffff' },
  XZ: { fin: '#0a6cb2', ink: '#ffffff' },
  XO: { fin: '#e4022d', ink: '#ffffff' },
  KM: { fin: '#c8102e', ink: '#ffffff' },
  // ---- Nordics & Baltics
  SK: { fin: '#003d7d', ink: '#ffffff' },
  DY: { fin: '#d81939', ink: '#ffffff' },
  D8: { fin: '#d81939', ink: '#ffffff' },
  N0: { fin: '#d81939', ink: '#ffffff' },
  WF: { fin: '#00843d', ink: '#ffffff' },
  AY: { fin: '#0b1560', ink: '#ffffff' },
  FI: { fin: '#003b71', ink: '#ffffff' },
  OB: { fin: '#e4022d', ink: '#ffffff' },
  BT: { fin: '#8fc63f', ink: '#1c1c1c' },
  N7: { fin: '#0a2f6b', ink: '#ffffff' },
  RC: { fin: '#0a4f9c', ink: '#ffffff' },
  DX: { fin: '#c8102e', ink: '#ffffff' },
  // ---- Central & Eastern Europe
  OK: { fin: '#0a3d91', ink: '#ffffff' },
  QS: { fin: '#00a1de', ink: '#ffffff' },
  LO: { fin: '#01346b', ink: '#ffffff' },
  E4: { fin: '#0a4f9c', ink: '#ffffff' },
  OU: { fin: '#0a4f9c', ink: '#ffffff' },
  JU: { fin: '#c8102e', ink: '#ffffff' },
  RO: { fin: '#0a3d91', ink: '#ffffff' },
  H4: { fin: '#0a6cb2', ink: '#ffffff' },
  '0B': { fin: '#0a4f9c', ink: '#ffffff' },
  FB: { fin: '#0a4f9c', ink: '#ffffff' },
  PS: { fin: '#0a3d91', ink: '#ffffff' },
  '6Y': { fin: '#c8102e', ink: '#ffffff' },
  ZB: { fin: '#c8102e', ink: '#ffffff' },
  // ---- Greece, Turkey & the Levant
  A3: { fin: '#00539f', ink: '#ffffff' },
  OA: { fin: '#00539f', ink: '#ffffff' },
  GQ: { fin: '#0a6cb2', ink: '#ffffff' },
  TK: { fin: '#c8102e', ink: '#ffffff' },
  PC: { fin: '#f5b800', ink: '#1c1c1c' },
  XQ: { fin: '#003da5', ink: '#ffffff' },
  VF: { fin: '#c8102e', ink: '#ffffff' },
  XC: { fin: '#0a3d91', ink: '#ffffff' },
  '8S': { fin: '#c8102e', ink: '#ffffff' },
  LY: { fin: '#003da5', ink: '#ffffff' },
  RJ: { fin: '#7b2c3b', ink: '#ffffff' },
  // ---- Gulf, Africa
  EK: { fin: '#d71921', ink: '#ffffff' },
  EY: { fin: '#bd8b13', ink: '#ffffff' },
  QR: { fin: '#5c0632', ink: '#ffffff' },
  FZ: { fin: '#00558b', ink: '#ffffff' },
  G9: { fin: '#c8102e', ink: '#ffffff' },
  WY: { fin: '#0a6b4f', ink: '#ffffff' },
  XY: { fin: '#00a04a', ink: '#ffffff' },
  SV: { fin: '#00694e', ink: '#ffffff' },
  GF: { fin: '#c8a15a', ink: '#1c1c1c' },
  KU: { fin: '#0a3d91', ink: '#ffffff' },
  MS: { fin: '#003da5', ink: '#ffffff' },
  AT: { fin: '#c8102e', ink: '#ffffff' },
  TU: { fin: '#c8102e', ink: '#ffffff' },
  ET: { fin: '#00843d', ink: '#f0c33c' },
  KQ: { fin: '#c8102e', ink: '#ffffff' },
  SA: { fin: '#003da5', ink: '#ffffff' },
  '4Z': { fin: '#0a4f9c', ink: '#ffffff' },
  FA: { fin: '#00a1de', ink: '#ffffff' },
  MK: { fin: '#c8102e', ink: '#ffffff' },
  HM: { fin: '#c8102e', ink: '#ffffff' },
  TC: { fin: '#0a6cb2', ink: '#ffffff' },
  VR: { fin: '#0a4f9c', ink: '#ffffff' },
  MD: { fin: '#0a6cb2', ink: '#ffffff' },
  // ---- North America
  AA: { fin: '#0078d2', ink: '#ffffff' },
  DL: { fin: '#003a70', ink: '#ffffff' },
  UA: { fin: '#002244', ink: '#ffffff' },
  B6: { fin: '#003876', ink: '#ffffff' },
  WN: { fin: '#304cb2', ink: '#f9b612' },
  AS: { fin: '#01426a', ink: '#ffffff' },
  NK: { fin: '#ffec00', ink: '#1c1c1c' },
  F9: { fin: '#046a38', ink: '#ffffff' },
  HA: { fin: '#4f2170', ink: '#ffffff' },
  AC: { fin: '#d0021b', ink: '#ffffff' },
  WS: { fin: '#0a3d91', ink: '#ffffff' },
  PD: { fin: '#0a2f6b', ink: '#ffffff' },
  TS: { fin: '#0a6cb2', ink: '#ffffff' },
  AM: { fin: '#0b2265', ink: '#ffffff' },
  Y4: { fin: '#a5228a', ink: '#ffffff' },
  VB: { fin: '#00a04a', ink: '#ffffff' },
  CM: { fin: '#0a3d91', ink: '#ffffff' },
  // ---- South America
  LA: { fin: '#1b0088', ink: '#ffffff' },
  AD: { fin: '#00b4e5', ink: '#ffffff' },
  G3: { fin: '#ff7020', ink: '#ffffff' },
  AV: { fin: '#e4022d', ink: '#ffffff' },
  AR: { fin: '#00b4e5', ink: '#ffffff' },
  H2: { fin: '#0a3d91', ink: '#ffffff' },
  JA: { fin: '#f5b800', ink: '#1c1c1c' },
  BW: { fin: '#c8102e', ink: '#ffffff' },
  // ---- Asia & Pacific
  SQ: { fin: '#f9a01b', ink: '#1c1c1c' },
  TR: { fin: '#f9d616', ink: '#1c1c1c' },
  CX: { fin: '#00645a', ink: '#ffffff' },
  JL: { fin: '#c8102e', ink: '#ffffff' },
  NH: { fin: '#13448f', ink: '#ffffff' },
  MM: { fin: '#a5228a', ink: '#ffffff' },
  KE: { fin: '#00256c', ink: '#ffffff' },
  '7C': { fin: '#f5820b', ink: '#ffffff' },
  TG: { fin: '#5b2b82', ink: '#f5b800' },
  FD: { fin: '#c8102e', ink: '#ffffff' },
  SL: { fin: '#c8102e', ink: '#ffffff' },
  MH: { fin: '#0a3d91', ink: '#ffffff' },
  AK: { fin: '#c8102e', ink: '#ffffff' },
  D7: { fin: '#c8102e', ink: '#ffffff' },
  GA: { fin: '#00548e', ink: '#ffffff' },
  VN: { fin: '#0a6b4f', ink: '#ffffff' },
  VJ: { fin: '#e4022d', ink: '#ffffff' },
  '5J': { fin: '#005caa', ink: '#ffffff' },
  JX: { fin: '#1c2b4a', ink: '#c8a15a' },
  IT: { fin: '#f5820b', ink: '#ffffff' },
  AI: { fin: '#c8102e', ink: '#ffffff' },
  '6E': { fin: '#0a2f6b', ink: '#ffffff' },
  SG: { fin: '#c8102e', ink: '#ffffff' },
  QP: { fin: '#f5820b', ink: '#ffffff' },
  UL: { fin: '#0a3d91', ink: '#ffffff' },
  Q2: { fin: '#0a6cb2', ink: '#ffffff' },
  KB: { fin: '#f5820b', ink: '#ffffff' },
  CZ: { fin: '#0a4f9c', ink: '#ffffff' },
  MU: { fin: '#c8102e', ink: '#ffffff' },
  CA: { fin: '#c8102e', ink: '#f0c33c' },
  HU: { fin: '#c8102e', ink: '#ffffff' },
  MF: { fin: '#0a6cb2', ink: '#ffffff' },
  QF: { fin: '#e40000', ink: '#ffffff' },
  JQ: { fin: '#ff5000', ink: '#ffffff' },
  VA: { fin: '#c8102e', ink: '#ffffff' },
  RX: { fin: '#c8102e', ink: '#ffffff' },
  NZ: { fin: '#1c1c1c', ink: '#ffffff' },
  FJ: { fin: '#0a3d91', ink: '#ffffff' },
  SB: { fin: '#0a6cb2', ink: '#ffffff' },
  TN: { fin: '#0a3d91', ink: '#ffffff' },
  QH: { fin: '#0a6b4f', ink: '#ffffff' },
  XR: { fin: '#c8102e', ink: '#ffffff' },
  E9: { fin: '#0a3d91', ink: '#ffffff' },
  WB: { fin: '#0a6cb2', ink: '#ffffff' },
}

// Brand tint / brand orange: the "we do not know" pair. Deliberately the app's
// own colours, so an unmapped airline reads as a Tryp.com placeholder rather
// than as a wrong livery.
const UNKNOWN = { fin: '#fbe3d6', ink: '#d94407' }

export function airlineBrand(iata) {
  return BRAND[String(iata || '').toUpperCase()] || UNKNOWN
}

export { UNKNOWN as UNKNOWN_AIRLINE_BRAND }
