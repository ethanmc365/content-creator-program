// THE APP STYLESHEET MUST NOT BLOCK THE FIRST PAINT, OR THE SPLASH CANNOT WORK.
//
// THE BUG: "on desktop the screen starts white then quickly blinks orange and
// then opens... on mobile it's the same, starts white then flashes orange and
// then opens. Can you stop it from immediately starting at white?"
//
// The boot splash in index.html is entirely inline precisely so it can be
// painted from the HTML alone. That reasoning was right and it was defeated by
// something the file cannot see: Vite injects
//
//     <link rel="stylesheet" crossorigin href="/assets/index-xxxx.css">
//
// into <head> at build time, and a stylesheet in the head is RENDER-BLOCKING.
// The browser will not paint anything - not the inline styles, not the boot
// layer, not the root background - until that file has arrived and been parsed.
// So the sequence anybody actually sees is: white for as long as the CSS takes,
// then orange for one blink, then the app. Every part of that is the stylesheet,
// and no amount of work inside index.html could have fixed it.
//
// SO THE LINK IS TURNED INTO A PRELOAD, AND main.jsx PROMOTES IT.
//
//   <link rel="preload" as="style" ... data-app-css>
//
// A preload is fetched at the same priority and is NOT render-blocking, so the
// first paint now happens as soon as the HTML is parsed: orange, with the plane
// on the runway, on the first frame. `main.jsx` flips `rel` to `stylesheet`
// before it renders and waits for the load, so React never commits into an
// unstyled document. See `promoteAppCss` there.
//
// WHY NOT `media="print" onload="this.media='all'"`, THE USUAL TRICK. The
// production CSP is `script-src 'self'` with no `'unsafe-inline'`, so an inline
// event handler attribute is refused by the browser and the stylesheet would
// never be applied at all. The promotion has to happen from a real script file.
//
// IF THIS PLUGIN EVER STOPS MATCHING (a Vite upgrade changing the emitted tag),
// the link stays a plain blocking stylesheet and the app is exactly as correct
// as it is today, one white flash worse. It fails safe in the only direction
// that matters.
export default function bootCss() {
  return {
    name: 'tryp-boot-css',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(
        /<link rel="stylesheet"([^>]*?)>/g,
        '<link rel="preload" as="style" data-app-css$1>',
      )
    },
  }
}
