// The three calendar apps, drawn as themselves.
//
// These buttons carried Icon "device", "globe" and "envelope" - a phone, a
// globe and a letter - which is three generic line icons where a person is
// scanning for a logo they already recognise. Nominative marks are the right
// call here: the whole job of the row is "which of these is my calendar".
//
// Each is a single flat path at its own brand colours, sized to the 24-grid so
// they sit at the same optical weight as each other. They are NOT wrapped in
// the orange rounded square the generic icons used, because a logo inside a
// brand-coloured tile reads as a Tryp.com product rather than a link out.

export function AppleMark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#000" aria-hidden>
      <path d="M16.36 12.68c-.02-2.2 1.79-3.26 1.87-3.31-1.02-1.49-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.11 8.76.73 1.06 1.6 2.24 2.75 2.2 1.1-.05 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.07 2.66-2.13.84-1.22 1.19-2.41 1.21-2.47-.03-.01-2.32-.89-2.34-3.53zM14.2 6.24c.61-.74 1.02-1.77.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.23z" />
    </svg>
  )
}

export function GoogleMark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.11A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.29a12 12 0 0 0 0 10.78l4-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.11C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  )
}

export function OutlookMark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {/* The envelope body, in Outlook's three blues. */}
      <path fill="#0364B8" d="M23.5 6.4c0-.5-.4-.9-.9-.9h-9.2v4.2l1.6 1 8.5-2.9V6.4z" />
      <path fill="#28A8EA" d="M13.4 9.7v9.9h9.2c.5 0 .9-.4.9-.9V7.8L13.4 9.7z" />
      <path fill="#0078D4" d="M13.4 5.5v4.2l4.9-1.7 5.2-1.6c0-.5-.4-.9-.9-.9h-9.2z" />
      <path fill="#14447D" d="M13.4 9.7 23.5 7.8v2.7l-10.1 3.1V9.7z" opacity=".4" />
      {/* The O panel. */}
      <path fill="#0078D4" d="M.5 4.3 12 2.1v19.8L.5 19.7V4.3z" />
      <path fill="#fff" d="M6.3 7.9c-1.9 0-3.2 1.7-3.2 4.1s1.3 4.1 3.2 4.1 3.2-1.7 3.2-4.1-1.3-4.1-3.2-4.1zm0 6.6c-1 0-1.6-1-1.6-2.5s.6-2.5 1.6-2.5 1.6 1 1.6 2.5-.6 2.5-1.6 2.5z" />
    </svg>
  )
}
