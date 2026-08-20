// The home-screen icon picker, as its own card so Settings stays readable.
//
// The awkward truth this card has to carry: picking an icon here does NOT change
// the icon already sitting on somebody's home screen, and nothing on the web
// can. See lib/appIcon for why. So the card does the one thing that is real -
// it decides which image the phone will copy the NEXT time the app is added -
// and then says exactly that, in three steps, rather than letting somebody tap
// an option, look at their home screen and conclude the feature is broken.
import { useState } from 'react'
import Icon from './Icon'
import { toastSuccess } from '../lib/toast'
import { CopyButton } from './ui'
import { APP_ICONS, APP_ICON_PARAM, getAppIcon, setAppIcon } from '../lib/appIcon'

// 60px is roughly what an app icon measures on an iPhone home screen, and the
// corner radius is the same fraction iOS uses. A preview at some other size is
// a picture of the artwork; at this size it is a preview of the decision.
const TILE = 'h-[60px] w-[60px] rounded-[22.5%]'

export default function AppIconPicker() {
  const [chosen, setChosen] = useState(getAppIcon)

  function choose(key) {
    const v = setAppIcon(key)
    setChosen(v.key)
    toastSuccess(`${v.label} icon selected`)
  }

  const active = APP_ICONS.find((v) => v.key === chosen) || APP_ICONS[0]
  // Built from the live origin rather than hard-coded, so it is right on the
  // vercel.app domain, on a custom domain, and in local development.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const installUrl = `${origin}/home?${APP_ICON_PARAM}=${active.key}`

  return (
    <section className="card">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="device" className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold">Home screen icon</h2>
      </div>
      <p className="text-sm text-smoke">
        Choose the icon this device uses when you add Tryp.com to your home screen.
      </p>

      <div className="mt-5 border-t border-gray-100 pt-5">
        {/* THREE AND THREE, NOT "whatever fits". A wrapping flex row laid the
            five icons out as five-and-nothing on a wide card and four-and-one
            on a narrow one, and a single orphan on the second row reads as an
            afterthought rather than a choice. A fixed three-column grid gives
            two even rows at every width the card is ever drawn at, which is
            also why there are six icons now rather than five. */}
        <div className="grid grid-cols-3 justify-items-center gap-4" role="radiogroup" aria-label="Home screen icon">
          {APP_ICONS.map((v) => {
            const on = v.key === chosen
            return (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(v.key)}
                className="group flex w-[72px] flex-col items-center gap-2 rounded-xl p-1 text-center transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 active:translate-y-0"
              >
                <span className="relative block">
                  <img
                    src={v.apple}
                    alt=""
                    aria-hidden
                    width="60"
                    height="60"
                    className={`${TILE} block bg-white object-cover shadow-card ring-1 ring-black/5`}
                  />
                  {/* The ring sits on a sibling rather than the image so it can
                      follow the icon's rounded corners without a second border
                      showing through the artwork. */}
                  <span
                    className={`pointer-events-none absolute -inset-1 rounded-[26%] border-2 transition-opacity ${
                      on ? 'border-brand opacity-100' : 'border-transparent opacity-0'
                    }`}
                  />
                  {on && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow">
                      <Icon name="check" className="h-3 w-3" />
                    </span>
                  )}
                </span>
                <span className={`text-[11px] font-semibold leading-tight ${on ? 'text-brand' : 'text-smoke'}`}>
                  {v.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* THE HONEST BIT, WITH THE LINK IT WAS MISSING.
          The steps were right and step two was a dead end: "open Tryp.com in
          your browser and add it to your home screen again" leaves somebody who
          has just DELETED their only shortcut with nothing to open. Ethan asked
          for the address to be handed over instead - "copy this link (here is
          where you need to provide the correct link for the correct icon they
          choose, with a button to copy it easily)".

          And the link carries the icon (`?icon=world`), so it works even if
          they paste it into a different browser or open it from a message. See
          lib/appIcon. */}
      <div className="mt-5 rounded-xl border border-gray-100 bg-cloud/40 p-4">
        <p className="flex items-start gap-2 text-xs font-semibold text-ink">
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0 text-brand" />
          An icon already on your home screen cannot be changed automatically
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-smoke">
          Your phone uses the icon it copied when you added the website, and keeps that copy. To swap it:
        </p>
        <ol className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-smoke">
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-brand shadow-sm">1</span>
            <span>Pick an icon above. You have chosen <strong className="font-semibold text-ink">{active.label}</strong>.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-brand shadow-sm">2</span>
            <span className="min-w-0 flex-1">
              Copy this link.
              <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-1.5">
                <code className="min-w-0 flex-1 truncate px-1 text-[11px] text-smoke">{installUrl}</code>
                <CopyButton value={installUrl} label="Copy" />
              </span>
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-brand shadow-sm">3</span>
            <span>Press and hold the current icon on your home screen, then remove it.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-brand shadow-sm">4</span>
            <span>Paste the link into your browser, press the share button, and add it to your home screen again.</span>
          </li>
        </ol>
      </div>
    </section>
  )
}
