import type { UserRole } from '../types/database'

export type NavLinkDef = {
  to: string
  label: string
  end?: boolean
}

export type NavModuleDef = {
  title: string | null
  links: NavLinkDef[]
}

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === 'desarrollador' || role === 'admin' || role === 'supervisor'
}

export function isOfficeRole(role: UserRole | null | undefined): boolean {
  return isStaffRole(role) || role === 'contador'
}

export function isShopFloorRole(role: UserRole | null | undefined): boolean {
  return role === 'operario' || role === 'consulta'
}

export function homePathForRole(role: UserRole | null | undefined): string {
  if (role === 'contador') return '/resultado'
  if (isShopFloorRole(role)) return '/produccion'
  return '/'
}

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function canAccessPath(
  role: UserRole | null | undefined,
  pathname: string,
  options?: { isVendorAdmin?: boolean },
): boolean {
  if (!role) return false
  if (pathMatches(pathname, '/admin/suscripcion')) {
    return options?.isVendorAdmin === true
  }
  if (isStaffRole(role)) return true

  if (role === 'contador') {
    return !(pathMatches(pathname, '/produccion') || pathMatches(pathname, '/ordenes') || pathMatches(pathname, '/referencias'))
  }

  return pathMatches(pathname, '/produccion') || pathMatches(pathname, '/mi')
}

export function navModulesForRole(
  role: UserRole | null | undefined,
  options?: { isVendorAdmin?: boolean },
): NavModuleDef[] {
  if (!role) return []

  if (isShopFloorRole(role)) {
    const links: NavLinkDef[] = [
      { to: '/produccion', label: 'Producción' },
      { to: '/mi', label: 'Mi rendimiento' },
    ]
    if (options?.isVendorAdmin) {
      links.push({ to: '/admin/suscripcion', label: 'Suscripción' })
    }
    return [{ title: null, links }]
  }

  const floorLinks: NavLinkDef[] =
    role === 'contador'
      ? []
      : [
          { to: '/produccion', label: 'Producción' },
          { to: '/ordenes', label: 'Órdenes' },
          { to: '/referencias', label: 'Referencias' },
        ]

  const modules: NavModuleDef[] = [
    {
      title: 'Operatividad',
      links: [
        { to: '/', label: 'Dashboard', end: true },
        ...floorLinks,
        { to: '/clientes', label: 'Clientes' },
        { to: '/operarios', label: 'Operarios' },
      ],
    },
    {
      title: 'Contabilidad',
      links: [
        { to: '/resultado', label: 'Costos y gastos' },
        { to: '/reportes', label: 'Este mes' },
      ],
    },
  ]

  // Enlace solo para vendor admin; sin título que mencione el rol interno.
  if (options?.isVendorAdmin) {
    modules.push({
      title: null,
      links: [{ to: '/admin/suscripcion', label: 'Suscripción' }],
    })
  }

  return modules
}
