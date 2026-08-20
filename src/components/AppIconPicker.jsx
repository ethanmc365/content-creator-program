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
import { APP_ICONS, getAppIcon, setAppIcon } from '../lib/appIcon'

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
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Home screen icon">
          {APP_ICONS.map((v) => {
            const on = v.key === chosen
            return (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={on}
                title={v.hint}
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
        <p className="mt-4 text-xs leading-relaxed text-smoke">{active.hint}</p>
      </div>

      {/* THE HONEST BIT. Short, numbered, and not a wall of text: nobody reads a
          paragraph explaining why their phone works the way it does, but three
          lines telling them what to press is a thing they will actually do. */}
      <div className="mt-5 rounded-xl border border-gray-100 bg-cloud/40 p-4">
        <p className="flex items-start gap-2 text-xs font-semibold text-ink">
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0 text-brand" />
          An icon already on your home screen cannot be changed
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-smoke">
          Your phone copies the icon at the moment you add the shortcut and keeps that copy. To swap it:
        </p>
        <ol className="mt-2 space-y-1 pl-4 text-xs leading-relaxed text-smoke">
          <li className="list-decimal">Pick an icon above.</li>
          <li className="list-decimal">Press and hold the Tryp.com icon on your home screen, then remove it.</li>
          <li className="list-decimal">Open Tryp.com in your browser and add it to your home screen again.</li>
        </ol>
      </div>
    </section>
  )
}
