import type { ReactNode } from 'react'
import type { SubscriptionState } from '../../lib/subscription'

/**
 * Ya no tapa la app. El aviso fijo vive en SubscriptionBanner y las páginas
 * deshabilitan guardar/editar/borrar cuando isSubscriptionReadOnly(state).
 * Se mantiene el wrapper por compatibilidad con AppShell.
 */
export function SubscriptionExpiredGate({
  children,
}: {
  state?: SubscriptionState
  children: ReactNode
}) {
  return children
}
