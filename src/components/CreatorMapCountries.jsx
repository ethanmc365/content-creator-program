import { memo } from 'react'
import { Geographies, Geography } from 'react-simple-maps'
import { countryKey } from '../lib/countryFacts'
import { BRAND_LIGHT } from './CreatorMapParts'

// THE LAND IS ITS OWN MEMOISED COMPONENT, AND THAT IS A PERFORMANCE FIX.
//
// THE BUG THIS FIXES. `<Geographies>` takes a render prop, so its 240 country paths were rebuilt on EVERY render of
// CreatorMap - and CreatorMap re-renders a lot: `liveZoom` is set from a rAF on every frame of a pinch or a wheel, and
// `tooltip` is set every time the pointer crosses a border. So dragging the map meant reconciling 240 <Geography>
// elements sixty times a second, and simply moving the mouse across Europe meant a full pass per country. Inside a 700px
// card that is a warm laptop; full screen, where the same work is being done at four times the pixel count, it is the
// team's "really laggy, a lot of glitching".
//
// Nothing about the land depends on the zoom or on the tooltip. Pulled out here
// and wrapped in `memo`, it re-renders only when the atlas, the tinting or the
// open country actually change - so a drag now touches the pins (which do have
// to counter-scale) and nothing else.
//
// Every prop is a primitive, a stable Set or a stable callback, because `memo`
// is a shallow compare and one fresh object literal a render would undo all of
// this silently.
export const Countries = memo(function Countries({
  features, homeNames, exploredView, exploredSet, openName,
  landFill, homeFill, exploredFill, hoverFill, separator,
  onSelect,
}) {
  return (
    <Geographies geography={features || EMPTY_GEO}>
      {({ geographies }) =>
        geographies
          .filter((geo) => geo.properties.name !== 'Antarctica')
          .map((geo) => {
            const name = geo.properties.name
            const isHome = homeNames.has(name)
            const isOpen = openName === name
            // BEEN TOGETHER, painted only while the filter is on. It sits
            // BELOW "home" in the order because somewhere a creator lives is a
            // stronger fact about that country than somewhere the network has
            // filmed, and above plain land for the obvious reason. Its own
            // lighter tint, so the two are still distinguishable when both are
            // showing.
            const isExplored = exploredView && exploredSet.has(countryKey(name))
            const base = isOpen
              ? BRAND_LIGHT
              : isHome ? homeFill
                : isExplored ? exploredFill
                  : landFill
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                // THE LAND IS A BUTTON NOW. Tapping a country asks the
                // community who has been there; see openCountry.
                onClick={() => onSelect(geo)}
                // NO HOVER HANDLERS. They existed only to feed the black name
                // pill, which is gone - and they were lifting a string into
                // React state on every border crossing, re-rendering the whole
                // map to do it. The `hover` fill below is CSS-level and does
                // the visual half without touching React at all.
                tabIndex={-1}
                style={{
                  default: { fill: base, stroke: separator, strokeWidth: 0.4, outline: 'none', transition: 'fill 0.18s ease' },
                  hover: { fill: isOpen ? BRAND_LIGHT : isHome ? homeFill : isExplored ? exploredFill : hoverFill, stroke: separator, strokeWidth: 0.4, outline: 'none', cursor: 'pointer' },
                  pressed: { fill: BRAND_LIGHT, outline: 'none', cursor: 'pointer' },
                }}
              />
            )
          })
      }
    </Geographies>
  )
})

// A stable empty collection for the frame before the shared atlas resolves. It
// has to be the SAME object every render or `<Geographies>` sees a new source.
const EMPTY_GEO = { type: 'FeatureCollection', features: [] }
