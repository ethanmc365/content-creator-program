import { describe, expect, it } from 'vitest'
import { installPromptFor } from './install'

// THE PROMPT THAT WENT MISSING FOR EXACTLY THE TWO PEOPLE WHO WOULD NOTICE.
//
// Ethan (9 Sep 2026): "previously we had it set up so that if you logged in on
// a mobile browser you just immediately get that pop up that says how to add it
// as an app on your home screen... but for some reason that just doesn't work
// anymore. Did you take it away? This should always be here permanently. Make
// sure it doesn't break again."
//
// It was one line - `if (profile.is_admin) return`, added on 7 Sep for the
// notifications nag and applied to the install wall too. Ethan is `owner` and
// Casandra is `global_admin`, so the feature was invisible to both admins and
// working perfectly for all 44 creators, which is the worst possible way for a
// regression to hide. "Make sure it doesn't break again" is this file.

const phoneBrowser = { phone: true, installed: false, inApp: false, wantsPush: true, status: 'active' }

describe('installPromptFor', () => {
  it('asks a creator on a phone browser to install, and gives them no way out', () => {
    expect(installPromptFor(phoneBrowser)).toEqual({ mode: 'install', dismissible: false })
  })

  // THE REGRESSION.
  it('asks an ADMIN on a phone browser too', () => {
    expect(installPromptFor({ ...phoneBrowser, isAdmin: true }).mode).toBe('install')
  })

  it('lets an admin past it, so the team is not locked out of /admin on a phone', () => {
    expect(installPromptFor({ ...phoneBrowser, isAdmin: true }).dismissible).toBe(true)
  })

  it('shows nothing once the app is installed and push is already on', () => {
    expect(installPromptFor({ ...phoneBrowser, installed: true, wantsPush: false }).mode).toBe(null)
  })

  it('asks an installed creator for notifications instead', () => {
    expect(installPromptFor({ ...phoneBrowser, installed: true }).mode).toBe('push')
  })

  // The 7 Sep decision, kept exactly as it was: a recurring nag the team said
  // they did not want. This is the half the admin exemption was written for.
  it('never nags an admin about notifications', () => {
    expect(installPromptFor({ ...phoneBrowser, installed: true, isAdmin: true }).mode).toBe(null)
  })

  it('sends an in-app webview to a real browser rather than walling it', () => {
    expect(installPromptFor({ ...phoneBrowser, inApp: true }).mode).toBe('browser')
  })

  it('leaves a desktop alone except for notifications', () => {
    expect(installPromptFor({ ...phoneBrowser, phone: false }).mode).toBe('push')
    expect(installPromptFor({ ...phoneBrowser, phone: false, wantsPush: false }).mode).toBe(null)
  })

  // A pending applicant is waiting on a person, not on an icon.
  it('asks a pending applicant for nothing at all', () => {
    expect(installPromptFor({ ...phoneBrowser, status: 'pending' }).mode).toBe(null)
    expect(installPromptFor({ ...phoneBrowser, status: 'pending', isAdmin: true }).mode).toBe(null)
  })

  it('is safe to call with nothing', () => {
    expect(installPromptFor()).toEqual({ mode: null, dismissible: true })
  })
})
