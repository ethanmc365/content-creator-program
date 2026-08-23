/* POPPINS, LOADED SO IT CAN NEVER HOLD UP THE FIRST PAINT.
 *
 * This used to be `@import url(https://fonts.googleapis.com/...)` on line 2 of
 * index.css, which is the slowest way there is to load a web font and the
 * reason a stress test measured 12.7 SECONDS OF BLANK SCREEN on a connection
 * that could not reach Google:
 *
 *   1. the browser downloads our 155KB index.css and parses it
 *   2. only THEN does it discover the @import and open a connection to
 *      fonts.googleapis.com
 *   3. only THEN does it get the @font-face rules and fetch the woff2 files
 *
 * Three round trips in series, and index.css is render-blocking for the whole
 * chain - so the app shows nothing at all until a THIRD PARTY answers. On a
 * normal connection that is a few hundred milliseconds nobody notices. On a
 * corporate network that blocks Google, or from mainland China where
 * fonts.googleapis.com is not reachable at all, it is a white screen until the
 * request times out. The font is decoration; it must never be able to decide
 * whether the app appears.
 *
 * So the stylesheet is attached from here instead, with `media="print"` until
 * it has loaded. A print stylesheet is not render-blocking, so the app paints
 * immediately in the fallback stack and swaps to Poppins the moment it
 * arrives - or simply stays in the fallback forever, which is a page that
 * works rather than a page that is not there.
 *
 * Why a file rather than an inline <script>: our CSP is `script-src 'self'`
 * with no unsafe-inline and no nonce, and the whole point of that line is that
 * nothing inline runs. `link.onload` set as a PROPERTY from a same-origin file
 * is not an inline handler, so this needs no CSP change whatsoever. The two
 * <link rel=preconnect> tags in index.html open the sockets in parallel with
 * this, so nothing is lost by not being a plain stylesheet link.
 */
(function () {
  var href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap'
  var link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  // Not render-blocking while it says "print"; promoted once it has landed.
  link.media = 'print'
  link.onload = function () { link.media = 'all' }
  document.head.appendChild(link)
})()
