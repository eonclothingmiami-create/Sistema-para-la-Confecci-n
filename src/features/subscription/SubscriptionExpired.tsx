import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  formatSubscriptionDateLong,
  VENDOR_CONTACT,
  type SubscriptionState,
} from '../../lib/subscription'

function isAppAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'desarrollador'
}

export function SubscriptionExpiredGate({
  state,
  children,
}: {
  state: SubscriptionState | undefined
  children: ReactNode
}) {
  const { profile } = useAuth()
  const location = useLocation()

  // El vendor debe poder registrar el pago aunque la suscripción esté vencida.
  if (location.pathname.startsWith('/admin/suscripcion')) {
    return children
  }

  // Fail-open: sin enforcement (o sin datos) no se bloquea la UI.
  if (!state || state.enforcement_enabled !== true || state.status !== 'expired') {
    return children
  }

  if (isAppAdmin(profile?.role)) {
    return <SubscriptionExpiredAdmin state={state} />
  }

  return <SubscriptionExpiredOperator />
}

function SubscriptionExpiredAdmin({ state }: { state: SubscriptionState }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold tracking-wide text-rose-600 uppercase">Suscripción vencida</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{VENDOR_CONTACT.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        {state.current_period_end
          ? `El periodo terminó el ${formatSubscriptionDateLong(state.current_period_end)}. La app quedó en solo lectura hasta renovar.`
          : 'La app quedó en solo lectura hasta renovar la suscripción.'}
      </p>
      <div className="mt-6 space-y-2 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-800">
        <p className="font-medium">{VENDOR_CONTACT.name}</p>
        <p>
          Correo:{' '}
          <a className="font-medium text-zinc-900 underline" href={`mailto:${VENDOR_CONTACT.email}`}>
            {VENDOR_CONTACT.email}
          </a>
        </p>
        {VENDOR_CONTACT.phone ? <p>Teléfono: {VENDOR_CONTACT.phone}</p> : null}
        <p className="text-zinc-500">{VENDOR_CONTACT.note}</p>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Puedes seguir consultando datos históricos. No se permiten capturas ni cambios nuevos.
      </p>
    </div>
  )
}

function SubscriptionExpiredOperator() {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col justify-center rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-900">Sistema en solo lectura</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        El sistema está temporalmente en solo lectura, contacta a tu administrador.
      </p>
    </div>
  )
}
