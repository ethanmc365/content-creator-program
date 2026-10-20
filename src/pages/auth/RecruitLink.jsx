import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { teamApi } from '../../api/team'

// /r/<code>: A RECRUITER'S LINK (migration 449). The sign-up source was already stored on this device as the page
// loaded (lib/signupSource), so all this does is count the click and send the visitor on: the community sign-up, or the
// permanent VIP sign-up link for a VIP link. An unknown or archived code still lands on the sign-up page.
export default function RecruitLink() {
  const { code } = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    let alive = true
    const go = (to) => alive && navigate(to, { replace: true })
    const fallback = setTimeout(() => go('/signup'), 6000)
    Promise.resolve(teamApi.recruitLinkOpen(String(code || '').toLowerCase()))
      .then(({ data }) => {
        clearTimeout(fallback)
        if (data?.ok && data.kind === 'vip' && data.vip_token) go(`/vip/join/${data.vip_token}`)
        else go('/signup')
      })
      .catch(() => { clearTimeout(fallback); go('/signup') })
    return () => { alive = false; clearTimeout(fallback) }
  }, [code, navigate])
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" aria-label="Loading" />
    </div>
  )
}
