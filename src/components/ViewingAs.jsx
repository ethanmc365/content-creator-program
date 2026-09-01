import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { Avatar } from './ui'
import { useT } from '../lib/i18n'

// LOOKING AT ONE CREATOR'S OWN PAGES, AS THEY SEE THEM.
//
// WHY IT IS NOT THE SANDBOX. "View as creator" already exists and answers a
// different question: what does the product look like to somebody who is not an
// admin. It is a fake account with no history. When a creator writes in asking
// why their voucher has not arrived, that tells you nothing - you need THEIR
// rewards page, with their rows in it.
//
// WHY IT IS A URL PARAMETER. It has to be linkable: the whole point is that an
// admin opens the roster, finds the person and lands on their page, and that
// only works if the page can be addressed. It also means the admin can send the
// link to a colleague.
//
// WHAT KEEPS IT SAFE. Two things, and the second is the one that matters.
// This hook returns null for anybody who is not an admin, so the parameter is
// inert for a creator who guesses it. And every page using it reads through the
// SAME row-level security every other read uses - an admin can already read
// these tables, and a creator still cannot. The parameter chooses which id to
// filter on; it does not grant anything.
//
// IT IS READ-ONLY BY CONSTRUCTION. Nothing here writes, and the pages it is
// used on are pages that display. An admin who wants to change something does
// it from the admin surface, where it is audited.

/**
 * Whose pages am I looking at?
 * @returns {{ id: string, viewing: boolean, person: object|null }}
 */
export function useViewAs() {
  const { user, profile } = useAuth()
  const [params] = useSearchParams()
  const asId = profile?.is_admin ? params.get('as') : null
  const viewing = !!asId && asId !== user?.id
  const [person, setPerson] = useState(null)

  useEffect(() => {
    if (!viewing) { setPerson(null); return undefined }
    let alive = true
    supabase.from('profiles').select('id, name, photo_url').eq('id', asId).maybeSingle()
      .then(({ data }) => { if (alive) setPerson(data || null) })
    return () => { alive = false }
  }, [viewing, asId])

  return { id: viewing ? asId : user?.id, viewing, person }
}

/**
 * The band that says whose page this is.
 *
 * Loud on purpose. An admin reading somebody else's rewards page and forgetting
 * that is how a support reply goes out with the wrong numbers in it, and the
 * page underneath is identical to their own by design - the banner is the only
 * thing separating the two.
 */
export function ViewingAsBanner({ viewing, person, backTo = '/admin/creators' }) {
  const tr = useT()
  if (!viewing) return null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-brand/30 bg-brand-tint/50 px-4 py-3">
      <Icon name="eye" className="h-4 w-4 shrink-0 text-brand" />
      {person && <Avatar src={person.photo_url} name={person.name} size="xs" />}
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-brand">
        {person ? person.name : 'Someone else'}
      </p>
      <Link to={backTo} className="btn-secondary shrink-0 !py-1.5 !px-3 text-xs">
        {tr("Back to creators")}
      </Link>
    </div>
  )
}
