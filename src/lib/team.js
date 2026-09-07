import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { testFlags } from './testData'

// WHO TO WRITE TO, IN ONE PLACE.
//
// Ethan, 7 Sep 2026: "for error pages and policies, terms and conditions etc, I
// think we had the contact email as info@tryp.com or my personal email,
// ethantryp.com@gmail.com. I now have a Google Workspace account, so I want you
// to change all those emails to ethan@tryp.com - that way it looks professional
// to any creators trying to reach out to me."
//
// It was in six files under three different spellings, which is the whole
// reason it drifted in the first place: the terms said `info@`, the error
// screen said a gmail address, and the compliance record said a third thing.
// One export, imported by every page that prints it, so the next change is one
// edit rather than a search.
//
// NB the legal pages print this as the CONTROLLER's contact address (Tryp.com
// LDA), which is what it has to be for GDPR purposes - a company-domain mailbox
// that outlives any one person. `ethan@tryp.com` is on the company domain, so
// it qualifies where the gmail address did not.
export const SUPPORT_EMAIL = 'ethan@tryp.com'

// THE PERSON BEHIND THE ADDRESS.
//
// The error screen already had this shape and it was right about why: an
// address alone does not answer the question somebody stuck actually has, which
// is "is a human going to read this". A name, a job title and a face do.
//
// The photo is a FILE in `public/` rather than the live `profiles.photo_url`,
// because the first place this renders is the error screen - which draws when
// the app has already failed and often has no session to query with. Copied
// from Ethan's own avatar; re-run the copy if he changes it.
export const TEAM_LEAD = {
  name: 'Ethan',
  role: 'Content Creator Community Lead',
  email: SUPPORT_EMAIL,
  photo: '/team/ethan.jpg',
}

// EVERYONE ELSE IS READ FROM THE DATABASE, NOT LISTED HERE.
//
// Ethan asked for "the whole Tryp.com team listed there, and they can
// specifically click to DM them". A hard-coded list of names would be wrong
// within a week - Casandra was promoted on 6 September and Jesus was removed
// before that - and a help page naming somebody who has left is worse than no
// help page. `is_admin` is already the platform's definition of "on the team";
// this reads it.
//
// `is_test` is filtered through `testFlags()` for the same reason the directory
// does it: the QA demo account is an admin and is not a person to write to.
// Yourself is dropped, because "message yourself" is not help.
export function useTeam(myId) {
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    supabase
      .from('profiles')
      .select('id, name, photo_url, bio, city, country, platform_role')
      .eq('is_admin', true).eq('status', 'active')
      .in('is_test', testFlags())
      .is('deletion_requested_at', null)
      .then(({ data }) => {
        if (!alive) return
        setTeam((data ?? []).filter((p) => p.id !== myId).sort(byRoleThenName))
        setLoading(false)
      })
    return () => { alive = false }
  }, [myId])
  return { team, loading }
}

// The owner first, then everybody else alphabetically. Not a hierarchy for its
// own sake: on a page about who to ask, the person who can answer anything
// should be the first name on it.
function byRoleThenName(a, b) {
  const rank = (p) => (p.platform_role === 'owner' ? 0 : 1)
  return rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '')
}
