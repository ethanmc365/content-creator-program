import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import PageSkeleton from './PageSkeleton'

// THE HUB PLACEHOLDER DREW THE PAGE'S FURNITURE TWICE.
//
// Ethan: "on the worldwide page on desktop, the skeleton loading cards are
// incorrectly laid out."
//
// `shape="hub"` is rendered from two places. `RouteSkeleton` renders it ALONE,
// while the route chunk is still downloading, so it has to draw the switcher,
// the two columns and the rail or it is a placeholder for a different page.
// GlobalHome renders it a second time from INSIDE `NetworkLayout`, which has
// already drawn all three - so that copy nested a rail inside a rail and a grid
// inside a grid, squeezing the article into what was left.
//
// The counts are the test. A second `lg:grid-cols-[...]` on the page IS the bug.
function gridCount(container) {
  return container.querySelectorAll('[class*="lg:grid-cols-"]').length
}

describe('the hub skeleton', () => {
  it('standalone, it draws the whole page: switcher, columns and rail', () => {
    const { container } = render(<PageSkeleton shape="hub" />)
    expect(gridCount(container)).toBe(1)
    // The rail's five cards, which only exist in the standalone copy.
    expect(container.querySelectorAll('.rounded-card.border').length).toBe(5)
    expect(container.querySelector('.rounded-full')).not.toBeNull()
  })

  it('inside a layout, it draws ONLY the article', () => {
    const { container } = render(<PageSkeleton shape="hub" inLayout />)
    // No second column grid - this is the fault, stated directly.
    expect(gridCount(container)).toBe(0)
    // No second rail.
    expect(container.querySelectorAll('.rounded-card.border').length).toBe(0)
    // No second switcher bar.
    expect(container.querySelector('.rounded-full')).toBeNull()
    // But the article itself is still there, at its real heights, or the page
    // would reflow when the data landed.
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(6)
  })
})
