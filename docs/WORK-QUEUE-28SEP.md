# Work queue, 28 Sep 2026 — status

Every item from Ethan's briefs, with what actually happened to each.
Live on production at `86535c0`. Migration 273 applied.

`[x]` done and deployed · `[ ]` not started · `[~]` partly done

---

## 1. Copy and small UI — DONE

- [x] **"Read the brief" → "View all details"** in all three places it appears:
      the worldwide strip and both live challenge cards.
- [x] **The details button is back on mobile**, directly above "Submit your
      video". It had been hidden below `sm` on the reasoning that submitting is
      the one you came for.
- [x] **Find a deal / Capture the trip**: one sentence, one card the size of its
      neighbours. No "prices move", no bullet list.
- [x] **Trip-idea icons**: the tinted disc is gone, the glyph grew into it.
- [x] **Leaderboard**: the voucher terms no longer head the board. The per-row
      badge and the "N points to the voucher" hint stay.
- [x] **Bonus**: Find a deal had shipped with NO Spanish at all. The whole
      feature, its six tips and the eight trip kinds, is now in `es.js`.

## 2. KPI tracker — MOSTLY DONE

- [ ] **Recruiters graph above the overview.** Not done.
- [x] **"Landed" / "Target" → "Achieved" / "Goal"**, in the legend and the
      tooltip, so the chart says one thing in both places.
- [x] **Room for more markets**: the pills scroll past about three rows instead
      of pushing the KPIs down the page, with the scroll contained. Nothing
      changes at seven markets, which is what was asked for.
- [x] **The target-met progress bar.** It was a white fill on a `bg-white/25`
      track, both on the orange header, so 100% read as empty. The track is dark
      now, and reaching the target sweeps a shine across the bar once.

## 3. Calendar — DONE

- [x] **The second two-finger swipe lands immediately.** macOS momentum kept
      refreshing the gap timer for up to a second, so the gesture never
      released; moving the mouse only ever meant waiting for the tail to die.
      Momentum only decays, so a delta bigger than the one before it is fingers
      back on the glass. `lib/wheelGesture.js`, nine rehearsals, one of which
      walks a real decaying tail event by event.
- [x] **The stray orange rule on a travelling day** is gone. It was a 2px bar
      meant to tie a run of days together, held 8px clear of both edges, so it
      stopped short at every cell.

## 4. Challenge recap — MOSTLY DONE

- [x] **"Your challenge in numbers" deleted.** Every figure on it had been said
      by an earlier card. The card and the figures it alone computed are gone.
- [x] **The final card's "1st of 28 creators, 4.8× average video" line removed.**
      It was the third time the placing appeared on one card.
- [ ] **The "Your Recap Is Ready" card on the challenges page**, level with the
      bonuses slot, showing "your recap is coming" when no bonus is active. Not
      done.

## 5. Certificates — MOSTLY DONE

- [x] **One first place, everywhere.** It was the orange gradient on Sky Banner
      and the Passport and WHITE on Horizon, because Horizon's badge sits on the
      orange panel. It is the gradient on every layout now; on the panel it gets
      a solid white halo instead of the inset ring. Verified: all thirty
      first-place badges in the bench are the gradient, none white.
- [x] **Third place is solid.** It was `alpha(accent, 0.12)`, so the Sky Banner
      band showed through it. The tint is painted over opaque white.
- [x] **Fourth and beyond** keep white with the ordinal.
- [x] **No "of 10" and no "PLACE".** The disc said one fact three times; it is
      the ordinal alone now.
- [x] **No category on the badge** — no PARTICIPANT, MILESTONE or HONOUR. The
      certificate's own sentence already says what it is for.
- [x] **Milestone icon is a trophy**, not a flag.
- [x] **The date block**: "Awarded" in bold with the date under it in smaller
      grey. The Passport is untouched, as agreed.
- [x] **Paper is white, full stop.** Five grounds became one. Every old key
      resolves to white rather than breaking. Accents untouched.
- [x] **The Badge / Tryp plane / Dotted route switches are gone** with the paper
      picker. All three simply draw.
- [x] **A certificate with no place** is supported (it always was; the badge
      shape for it is what changed).
- [x] **The wording bug is fixed.** Switching the trigger now brings its own
      sentence when the one already written could not fill under it, and leaves
      wording that can. That is `bodyForTrigger`.
- [x] **The milestone picker is pills**, like every other choice on that form,
      instead of the native menu.
- [x] **Horizon**: the dotted route no longer loops round the portrait, where it
      read as a ring drawn on the photo.
- [x] **Horizon / the studio preview** shows the admin's own name with their own
      photo, rather than their face over "Roxanna Travels".
- [x] **Passport prints the name forwards.** The machine-readable strip keeps
      passport ordering, because that is a barcode, not a way of addressing
      somebody.
- [x] **Boarding pass**: a much larger QR with a small caption under it, instead
      of a SCAN TO VERIFY column taking a third of the stub. The destination
      sits on its own centre.
- [x] **The verify page** walks down its answer a beat at a time rather than
      appearing all at once, and lost two em dashes.
- [x] **Postcard**: the postmark was 300px wide, pinned outside the right margin,
      so its cancel lines ran across the stamp and its ring clipped the corner.
      It sits to the left of the stamp now and clears it by twenty pixels.
      Measured on all three postcards: no overlap.
- [x] **Minimal**: the badge is 124px, up from 100px.
- [x] **The "Took part" heading**: the bar printed the design's internal name in
      bold beside a Live chip, above a certificate that also carries words. It
      says "Editing" in front of it now.
- [x] **The page says what it is** — each card is a design plus the rule that
      hands it out, not a certificate somebody has been given — and explains
      Live against Draft.
- [x] **A draft is marked, not dimmed.** `opacity-60` washed out the certificate
      the card exists to show; it is a dashed border now.
- [x] **The Instagram story size was always there**: `/rewards`, on each
      certificate, "Share to your story", 1080 x 1920 on a Tryp.com ground. It
      could not be found because certificates are not live yet. The studio now
      says where it is.
- [ ] **Cut the list back to one example certificate.** NOT done deliberately —
      those are real rows in the database, and deleting an admin's saved designs
      is his call, not mine. The page explains them instead.
- [ ] **`certificates_live` is still FALSE.** NOT flipped deliberately: "then I
      can get it live", "I'll give you the go ahead for the creators". One
      switch when you are ready.

## 6. The duplicate-entry investigation — DONE

- [x] **Investigated.** All eight of Natalia's surviving links resolve 1:1 to
      distinct video ids matching what is stored, and the sync writes each row
      from its own resolution. The removals were correct. The mechanism is that
      TikTok mints a NEW share code every time Share is pressed, so one video
      submitted twice arrives as two links with nothing in common.
- [x] **Caught at submit now.** `thumb-cache` was already following the short
      link for the cover and never said where it landed; it returns the
      canonical URL and video id, the submit form writes it with the entry, and
      the guard fires immediately. No points are given to a repeat, so none are
      taken back. Deployed as v6 and verified against production.
- [x] **Migration 273 applied**: a late-caught duplicate is archived to
      `submission_duplicates` before deleting, the creator is notified, and
      `reinstate_duplicate` puts it back with its video id cleared.
- [x] **Never across creators.** The old trigger matched on (challenge, video)
      with no creator test, so a collab or duet would have handed one creator's
      entry to another. That case raises an admin alert instead.
- [x] **Rehearsed**: `supabase/tests/duplicate_entries.sql`, six checks.
- [x] **Nothing to revert.** The removals were genuine; the three rows are
      unrecoverable either way, which is the fault 273 fixes for next time.

## 7. Invoices — DONE

- [x] **No em dash**: "Someone not on the platform".
- [x] **No € in the heading.** The switch says it and the box says it again.
- [x] **The date box aligns with the amount box**, to the pixel, measured live.
- [x] Notes already followed the currency; left as they were.

## 8. Admin-sent notifications — NOT DONE

- [ ] A button beside Edit on a challenge to compose and send a push.
- [ ] The mid-challenge "you are 3 points from a voucher" nudge.

## 9. Rewards and referrals — NOT DONE

- [ ] Voucher wallet improvements.
- [ ] All-time referrals leaderboard for creators.

## 10. Spanish and the languages page — BARELY STARTED

- [~] Find a deal was translated (see group 1). That is one feature of many.
- [ ] The full sweep of recently-added strings.
- [ ] Worldwide cards growing in Spanish.
- [ ] The top nav misaligned in Spanish.
- [ ] A Translate button on a brief.
- [ ] Making German trivial to add.
- [ ] **Rebuilding the admin languages page.** Not started.

## 11. Creator network map — DONE

- [x] **Bounded by country.** Europe collapsed into one pin of 130 on the UK
      because single linkage is transitive and Europe is a dense chain of towns:
      at world zoom the reach is ~30 units and no two neighbouring countries are
      further apart, so Dublin chained to Manchester to Amsterdam to Madrid.
      No edge is built between towns in different countries now.
- [x] **Measured against the live community**, 142 located creators: 25 pins at
      world zoom, biggest 47, one per market; 45 pins by zoom 27, biggest 17.
      The total is 142 at every zoom, so nobody is dropped or double-counted.
- [x] **Quicker**: the regroup waited 160ms after the zoom settled on top of a
      420ms fly. 60ms and 240ms now.
- [x] **The arithmetic moved to `lib/pinCluster.js`** with sixteen rehearsals.
      One erases the countries and asserts the single blob returns, so the chain
      reaction is proven rather than assumed.
- [x] **The dotted threads** joined the RAW towns, so lines outlived the pins
      they connected. They thread the grouped pins now: 44 threads for 45 pins.
      This is also the fix for the same fault on the public programme page.

## 12. Public programme page — PARTLY DONE

- [x] **The dotted lines** are fixed by group 11 (same component).
- [ ] **The Wall of Fame.** Not done.
- [ ] **The privacy toggle** that would go with it. Not done.

## 13. Admin invite link — NOT DONE

- [ ] A shareable link for the Tryp.com team to apply for admin access, with
      your approval still required, a shortened signup (name, photo, bio,
      tutorial; no bank details or socials) and a settable role title.

---

## What needs you

1. **`certificates_live`** is one switch away. Everything behind it is built.
2. **The certificate list**: say the word and I will cut it back to one example,
   but that means deleting saved designs, so it is your call.
3. **Groups 8, 9, 10, 12 and 13** are still open. Group 10 (Spanish and the
   languages console) is the largest single piece left.
