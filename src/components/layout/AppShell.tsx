import {
  Building2,
  ClipboardList,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Shirt,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { InstallBanner } from '../ui/InstallBanner'
import { RequireRole } from '../../features/auth/RequireRole'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { useAuth } from '../../hooks/useAuth'
import { useRealtimeInvalidation } from '../../hooks/useRealtimeInvalidation'
import { navModulesForRole } from '../../lib/access'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS } from '../../types/database'

const navIcons = {
  '/': LayoutDashboard,
  '/produccion': ClipboardList,
  '/ordenes': Factory,
  '/referencias': Shirt,
  '/clientes': Building2,
  '/operarios': Users,
  '/resultado': Wallet,
  '/reportes': Scissors,
  '/mi': User,
} as const

export function AppShell() {
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const install = useInstallPrompt()
  const modules = navModulesForRole(profile?.role)
  useRealtimeInvalidation()

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-100 lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-zinc-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">Sistema para la Confección</p>
            <p className="truncate text-xs text-zinc-500">Eficiencia de taller</p>
          </div>
          <button className="rounded-md p-1 text-zinc-500 lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-4 overflow-y-auto p-3">
          {modules.map((module) => (
            <div key={module.title ?? 'menu'}>
              {module.title ? (
                <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
                  {module.title}
                </p>
              ) : null}
              <div className="flex flex-col gap-1">
                {module.links.map((link) => {
                  const Icon = navIcons[link.to as keyof typeof navIcons] ?? ClipboardList
                  return (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                          isActive
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{link.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {open ? (
        <button
          className="fixed inset-0 z-30 bg-zinc-950/30 lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur">
          <button
            className="rounded-md p-1 text-zinc-600 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden truncate text-sm font-medium text-zinc-800 lg:block">
            Sistema para la Confección
          </p>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-medium text-zinc-800">
                {profile?.full_name || user?.email}
              </p>
              <p className="truncate text-[11px] text-zinc-500">
                {profile ? ROLE_LABELS[profile.role] : 'Operario'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-zinc-300 p-2 text-zinc-600 hover:bg-zinc-50"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className={`min-w-0 p-4 sm:p-6 ${install.visible ? 'pb-36' : ''}`}>
          <RequireRole>
            <Outlet />
          </RequireRole>
        </main>
        <InstallBanner prompt={install} />
      </div>
    </div>
  )
}
