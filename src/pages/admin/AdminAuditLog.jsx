import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDateTime } from '../../lib/utils'

// Read-only record of account actions admins have taken (approve, decline,
// mute, suspend, promote, restore, delete). Written by DB triggers, not the API.
export default function AdminAuditLog() {
  const [log, setLog] = useState(null)

  useEffect(() => {
    supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => setLog(data ?? []))
  }, [])

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Audit log" subtitle="A record of account actions taken by the Tryp.com Team." />

      {log === null ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : log.length === 0 ? (
        <EmptyState icon={<Icon name="clock" className="h-7 w-7" />} title="No actions logged yet" hint="Admin account actions (approvals, mutes, deletions, etc.) will appear here." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {log.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{e.actor_name || 'An admin'}</span>
                  <span className="text-smoke"> · {e.action}</span>
                  {e.target_name && <> · <span className="font-medium">{e.target_name}</span></>}
                </p>
                {e.detail && <p className="text-xs text-smoke">{e.detail}</p>}
              </div>
              <span className="shrink-0 text-xs text-smoke">{formatDateTime(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
