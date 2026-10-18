import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useIsVendorAdmin } from '../../hooks/useSubscription'
import { canAccessPath, homePathForRole } from '../../lib/access'

export function RequireRole({ children }: { children: ReactNode }) {
  const { profile, loadingProfile } = useAuth()
  const vendorQuery = useIsVendorAdmin()
  const location = useLocation()

  if (loadingProfile || !profile) {
    return <div className="py-16 text-center text-sm text-zinc-500">Cargando…</div>
  }

  if (
    !canAccessPath(profile.role, location.pathname, {
      isVendorAdmin: vendorQuery.data === true,
    })
  ) {
    return <Navigate to={homePathForRole(profile.role)} replace />
  }

  return children
}
