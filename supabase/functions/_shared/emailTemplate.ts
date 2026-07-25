// One branded HTML shell for every email the platform sends, so a broadcast, a
// notification and an invoice all look like the same company wrote them.
//
// Design constraints that differ from the web app:
//  - Tables, not flexbox/grid. Outlook still uses Word's rendering engine.
//  - Inline styles only. Gmail strips <style> blocks in many clients.
//  - No web fonts. Poppins won't load in mail, so we fall back gracefully to a
//    system sans stack that reads closely enough.
//  - Max width 600px, the safe width for every mail client and mobile.
const BRAND = '#d94407'
const INK = '#1a1a1a'
const SMOKE = '#6b7280'
const FONT = "'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export type EmailOpts = {
  title: string
  /** Body HTML. Keep it simple: <p>, <ul>, <strong>, <a>. */
  bodyHtml: string
  /** Optional call-to-action button. */
  ctaLabel?: string
  ctaUrl?: string
  /** Shown small under the button, e.g. why they got this email. */
  footerNote?: string
  appUrl: string
  /** Absolute URL to the logo. Mail clients can't use relative paths. */
  logoUrl?: string
}

/** Escape text destined for an HTML attribute or text node. */
export function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Turn a plain-text admin message into simple, safe paragraph HTML. */
export function textToHtml(text: string) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export function renderEmail(o: EmailOpts) {
  const logo = o.logoUrl ?? `${o.appUrl}/brand/tryp-logo.png`
  const cta = o.ctaLabel && o.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
         <tr><td style="border-radius:9999px;background:${BRAND}">
           <a href="${esc(o.ctaUrl)}"
              style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px">
             ${esc(o.ctaLabel)}
           </a>
         </td></tr>
       </table>`
    : ''

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececee">

        <!-- Brand bar -->
        <tr><td style="background:${BRAND};padding:22px 32px">
          <img src="${esc(logo)}" alt="Tryp.com" width="104"
               style="display:block;border:0;height:auto;max-width:104px" />
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.3;color:${INK};font-weight:700">
            ${esc(o.title)}
          </h1>
          <div style="font-family:${FONT};font-size:15px;color:${INK}">
            ${o.bodyHtml}
          </div>
          ${cta}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #f1f1f2">
          ${o.footerNote ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.6;color:${SMOKE}">${o.footerNote}</p>` : ''}
          <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${SMOKE}">
            Tryp.com Content Creator Program ·
            <a href="${esc(o.appUrl)}/settings" style="color:${BRAND};text-decoration:underline">Email preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}
