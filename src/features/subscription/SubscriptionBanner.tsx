import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useSubscription } from '../../hooks/useSubscription'
import {
  dismissNoticeStorageKey,
  getSubscriptionNotice,
  VENDOR_CONTACT,
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
  const admin = isAppAdmin(profile?.role)

  useEffect(() => {
    if (!notice || !notice.dismissible) {
      setDismissed(false)
      return
    }
    setDismissed(readDismissed(notice.kind, data?.current_period_end ?? null))
  }, [notice, data?.current_period_end])

  if (!notice) return null
  if (notice.dismissible && dismissed) return null

  // Avisos de 1/0 día y grace: solo admin. Expired: todos (mensaje distinto).
  if (notice.kind !== 'expired' && !admin) return null

  const toneClass =
    notice.tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-950'
      : 'border-rose-300 bg-rose-50 text-rose-950'

  if (notice.kind === 'expired') {
    return (
      <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
        {admin ? (
          <>
            <p className="font-medium leading-relaxed">{notice.message}</p>
            <p className="mt-2 leading-relaxed">
              La app está en solo lectura. Para renovar escribe a{' '}
              <a className="font-medium underline" href={`mailto:${VENDOR_CONTACT.email}`}>
                {VENDOR_CONTACT.email}
              </a>
              . {VENDOR_CONTACT.note}
            </p>
          </>
        ) : (
          <p className="leading-relaxed">
            El sistema está temporalmente en solo lectura, contacta a tu administrador.
          </p>
        )}
      </div>
    )
  }

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
