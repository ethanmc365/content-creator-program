# Work queue — status at the end of the 28 Sep session

Every item from Ethan's briefs, with what actually happened to each.

`[x]` done and deployed · `[ ]` not started · `[~]` partly done

---

## Reported this session — ALL DONE

- [x] **The Facebook play button.** A Facebook entry had no cover, so the card
      drew Facebook's own embeddable PLAYER where the picture goes, and a player
      draws a play button on itself. The premise it rested on was wrong:
      fetched as a crawler, a `/share/r/` link redirects to the reel and the
      page carries the clean cover. `thumb-cache` v7 deployed; all four
      Facebook entries on production now have a stored cover.
- [x] **The creator map freezing on fast zoom.** Measured on the production
      build: two long tasks of 1,240ms, and a CPU profile with 3,490ms inside
      d3-geo. The country-tinting sweep ran every country against every creator
      — up to 37,920 full polygon streams — and re-ran every time an in-browser
      geocode landed, which is why the freeze arrived mid-gesture.
      `lib/homeCountries` rejects on a bounding box first. Proven to return the
      identical 21 country names on the real atlas. Worst frame 1,244ms → 110ms.
- [x] **The calendar swiping four months.** The previous fix released a gesture
      when a delta came in bigger than the one before it; a real flick RAMPS UP,
      so one swipe released itself three or four times. A gesture remembers its
      peak now and only believes a rise after the deltas have decayed away from
      it. Measured in a browser: 1 swipe → 1 month, 2 → 2, 3 → 3.
- [x] **The invoice conversion note.** It described the last button press, not
      the document, so pressing GBP on a sterling prize said "converted from
      €23". It only appears when the invoice is in a different currency from
      the prize as awarded.
- [x] **Invoices convert BOTH ways.** A euro prize won by a creator banking in
      pounds used to change its sign and keep its number. `rewards.currency`
      always held the answer and nothing passed it on.
- [x] **KPI "98% of the way through (£49)".** Now "98% through · a steady pace
      would be at £49 today".
- [x] **KPI "of 12.5M for the year".** The totals were right and the label was
      wrong: both figures sum only the periods that HAVE a target. It now says
      "across the 2 quarters with a target" whenever that is not the whole year.
      The numbers themselves check out — every join on the platform is Aug/Sep
      2026, so 177 recruited in Q3 is real.
- [x] **The progress bar is a green gradient** on the KPI detail.
- [x] **The "This quarter" button.** Out of the card, renamed "Back to Q3 2026"
      so it cannot read as a label, and the markets are one scrollable line so
      nothing beside them can change their height again.
- [x] **Recruiters graph above the overview.** Who brought each quarter's
      intake in, with the filmed/not-filmed split.
- [x] **Creator kit: the form scrolled through the tab.** Two causes — the bar
      was translucent, and there is a 15px window between the app header and
      where the bar sticks. Both closed.
- [x] **Creator kit: the tab UI.** Two rows now — identity and actions above,
      the sections as a segmented control that shows which one you are in.
- [x] **The Sky banner, redrawn.** Horizon arc, centred title, the plane flying
      clear above the words, the medal on the horizon, an accent rule under the
      name. The other five layouts are untouched.
- [x] **All previous certificates deleted**, archived first by migration 274
      into two admin-only tables. Nobody lost one they had seen — all three had
      `seen_at = null`.
- [x] **`certificates_live` is TRUE.** With no designs there is nothing to
      award, so creators receive nothing until you make one.
- [x] **"Awarded" is no longer Tryp.com orange** — it is the green this app now
      uses for something reached.
- [x] **The Instagram story is visible in the studio**, under the certificate,
      drawn from the same component the creator's download comes from.
- [x] **The chat avatar moving.** The action bar makes space under the bubble,
      which grew the flex row the avatar was pinned to the bottom of. The face
      is inside `MessageActions` now and shares a row with the bubble alone.
      Measured: identical top edge before and after, to the pixel.
- [x] **The bonus points card.** Three facts in the rail; everything that
      qualifies them opens in its own card.

## Also finished from the old list

- [x] **A push composer beside Edit on a challenge.** Shows how it arrives on a
      phone, defaults to the challenge's market, and counts both who gets the
      notification and how many will actually get a PUSH — that second number
      had to come from `admin_push_adoption`, because `push_subscriptions` is
      readable only by its owner and an admin counting off it gets zero.
- [x] **The mid-challenge voucher nudge** (migrations 275–276, cron at 10:00).
- [x] **All-time referrals leaderboard** for creators (migration 277).

---

## NOT DONE — what is left

These were on the list and did not get built this session.

- [ ] **The "Your Recap Is Ready" card** on the challenges page, level with the
      bonuses slot.
- [ ] **Voucher wallet improvements.** The referrals leaderboard landed; the
      wallet itself was not touched.
- [ ] **Spanish and the languages page.** The largest single piece left:
      the full sweep of recently-added strings, worldwide cards growing in
      Spanish, the top nav misaligned in Spanish, a Translate button on a brief,
      making German trivial to add, and rebuilding the admin languages page.
- [ ] **The Wall of Fame** on the public programme page, and the privacy toggle
      that goes with it.
- [ ] **The admin invite link** — a shareable link for the Tryp.com team to
      apply for admin access, with approval still required, a shortened signup
      and a settable role title.

## What needs you

1. **Make your certificates.** The slate is empty and the feature is live, so
   nothing reaches a creator until you create and activate a design.
2. **The voucher nudge fires at 10:00 tomorrow** for six creators in the Global
   Challenge. Nothing has been sent yet. Say if you would rather it did not.
