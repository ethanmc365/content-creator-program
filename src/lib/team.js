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
  // THE LEAD IS LOOKED UP, NOT WRITTEN DOWN. The card at the top of Get help
  // needs a profile id to link to and to open a chat with, and hard-coding a
  // UUID in the source is the kind of constant that is silently wrong the day
  // the owner changes. `platform_role = 'owner'` is already the platform's
  // definition of that person.
  //
  // It is NOT filtered by `myId` the way the list below is: Ethan reading his
  // own help page should still see the card, because it is what every creator
  // sees and he is the one who has to approve it. The two buttons on it are
  // hidden for him instead - see HelpTeam - because "message yourself" is not
  // help.
  const [lead, setLead] = useState(null)
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
        const rows = data ?? []
        const owner = rows.find((p) => p.platform_role === 'owner') || null
        setLead(owner)
        setTeam(rows.filter((p) => p.id !== myId && p.id !== owner?.id).sort(byName))
        setLoading(false)
      })
    return () => { alive = false }
  }, [myId])
  return { team, lead, loading }
}

const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
