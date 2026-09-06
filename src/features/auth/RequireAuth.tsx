import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-500">Cargando…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
