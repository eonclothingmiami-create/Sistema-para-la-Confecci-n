import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useSubscription } from '../../hooks/useSubscription'
import {
  dismissNoticeStorageKey,
  getSubscriptionNotice,
  type SubscriptionNoticeKind,
} from '../../lib/subscription'

function isAppAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'desarrollador'
}

function readDismissed(kind: SubscriptionNoticeKind, periodEnd: string | null): boolean {
  try {
    return localStorage.getItem(dismissNoticeStorageKey(kind, periodEnd)) === '1'
  } catch {
    return false
  }
}

function writeDismissed(kind: SubscriptionNoticeKind, periodEnd: string | null) {
  try {
    localStorage.setItem(dismissNoticeStorageKey(kind, periodEnd), '1')
  } catch {
    // ignore quota / private mode
  }
}

export function SubscriptionBanner() {
  const { profile } = useAuth()
  const { data } = useSubscription()
  const notice = useMemo(() => getSubscriptionNotice(data), [data])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!notice || !notice.dismissible) {
      setDismissed(false)
      return
    }
    setDismissed(readDismissed(notice.kind, data?.current_period_end ?? null))
  }, [notice, data?.current_period_end])

  if (!isAppAdmin(profile?.role) || !notice) return null
  if (notice.kind === 'expired') return null
  if (notice.dismissible && dismissed) return null

  const toneClass =
    notice.tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-950'
      : 'border-rose-300 bg-rose-50 text-rose-950'

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
      <p className="min-w-0 flex-1 leading-relaxed">{notice.message}</p>
      {notice.dismissible ? (
        <button
          type="button"
          className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100"
          aria-label="Cerrar aviso"
          onClick={() => {
            writeDismissed(notice.kind, data?.current_period_end ?? null)
            setDismissed(true)
          }}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
