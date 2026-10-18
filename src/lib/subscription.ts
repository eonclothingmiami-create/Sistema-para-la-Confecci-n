export type SubscriptionEffectiveStatus =
  | 'active'
  | 'due_soon'
  | 'grace'
  | 'suspended'
  | 'expired'

export type SubscriptionState = {
  /** Estado efectivo (compat + alias de effective_status). */
  status: SubscriptionEffectiveStatus
  effective_status?: SubscriptionEffectiveStatus
  stored_status?: string | null
  plan?: string | null
  current_period_end: string | null
  days_left: number
  grace_days: number
  grace_days_left: number
  grace_until?: string | null
  days_left_in_grace?: number
  message?: string | null
  /** Si es false, suspended/expired no bloquean UI; due_soon y grace sí muestran aviso. */
  enforcement_enabled?: boolean
  source?: 'local' | 'panel' | string | null
  last_synced_at?: string | null
  tenant_id?: string | null
  panel_version?: number
}

export type SubscriptionNoticeKind = 'due_tomorrow' | 'due_today' | 'grace' | 'expired' | 'suspended'

export type SubscriptionNotice = {
  kind: SubscriptionNoticeKind
  tone: 'amber' | 'red'
  dismissible: boolean
  message: string
  /** Mensaje opcional del panel (debajo del texto principal). */
  vendorMessage?: string | null
}

const bogotaDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/** Formatea YYYY-MM-DD (o ISO) como fecha larga en es-CO / America/Bogota. */
export function formatSubscriptionDateLong(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const day = isoDate.slice(0, 10)
  // Mediodía UTC evita corrimiento de día al interpretar solo la fecha.
  const date = new Date(`${day}T12:00:00.000Z`)
  return bogotaDateFormatter.format(date)
}

export function todayBogotaISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function resolveEffectiveStatus(
  state: SubscriptionState | null | undefined,
): SubscriptionEffectiveStatus | null {
  if (!state) return null
  const raw = state.effective_status ?? state.status
  if (
    raw === 'active' ||
    raw === 'due_soon' ||
    raw === 'grace' ||
    raw === 'suspended' ||
    raw === 'expired'
  ) {
    // Compat con RPC antigua (status=active + days_left 0/1)
    if (raw === 'active' && (state.days_left === 0 || state.days_left === 1)) {
      return 'due_soon'
    }
    return raw
  }
  return 'active'
}

/**
 * Avisos según effective_status.
 * due_soon y grace: siempre (aunque enforcement esté apagado).
 * suspended / expired: solo con enforcement_enabled === true.
 * state null (RPC fallido): sin aviso (fail-open).
 */
export function getSubscriptionNotice(state: SubscriptionState | null | undefined): SubscriptionNotice | null {
  if (!state) return null

  const effective = resolveEffectiveStatus(state)
  if (!effective || effective === 'active') return null

  const enforcementOn = state.enforcement_enabled === true
  const vendorMessage = state.message?.trim() ? state.message.trim() : null

  if (effective === 'due_soon') {
    if (state.days_left === 1) {
      return {
        kind: 'due_tomorrow',
        tone: 'amber',
        dismissible: true,
        message: `Tu suscripción vence mañana, ${formatSubscriptionDateLong(state.current_period_end)}.`,
        vendorMessage,
      }
    }
    return {
      kind: 'due_today',
      tone: 'red',
      dismissible: true,
      message: 'Tu suscripción vence hoy.',
      vendorMessage,
    }
  }

  if (effective === 'grace') {
    const until = state.grace_until ?? null
    const message = enforcementOn
      ? until
        ? `Tu suscripción está vencida. Tienes hasta el ${formatSubscriptionDateLong(until)} para renovar antes de que el sistema quede en solo lectura.`
        : 'Tu suscripción está vencida. Renueva antes de que el sistema quede en solo lectura.'
      : until
        ? `Tu suscripción está vencida. Tienes hasta el ${formatSubscriptionDateLong(until)} para renovar.`
        : 'Tu suscripción está vencida. Renueva para continuar con normalidad.'
    return {
      kind: 'grace',
      tone: 'red',
      dismissible: false,
      message,
      vendorMessage,
    }
  }

  if (effective === 'suspended' || effective === 'expired') {
    if (!enforcementOn) return null
    return {
      kind: effective === 'suspended' ? 'suspended' : 'expired',
      tone: 'red',
      dismissible: false,
      message: 'El sistema está en modo solo lectura. Contacta a tu proveedor para reactivarlo.',
      vendorMessage,
    }
  }

  return null
}

/** Solo lectura de UI cuando enforcement está activo y el estado es suspended/expired. */
export function isSubscriptionReadOnly(state: SubscriptionState | null | undefined): boolean {
  if (state?.enforcement_enabled !== true) return false
  const effective = resolveEffectiveStatus(state)
  return effective === 'expired' || effective === 'suspended'
}

export function isSubscriptionWriteDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : ''
  return code === '42501' || /row-level security|permission denied|violates row-level security/i.test(message)
}

export const SUBSCRIPTION_WRITE_DENIED_MESSAGE =
  'La suscripción está vencida; no se pueden guardar cambios'

/** Contacto genérico (sin branding interno del panel). */
export const VENDOR_CONTACT = {
  title: 'Renovación de suscripción',
  email: 'eonclothingmiami@gmail.com',
  note: 'Escribe indicando el nombre del taller y el comprobante de pago.',
} as const

export function dismissNoticeStorageKey(kind: SubscriptionNoticeKind, periodEnd: string | null): string {
  return `subscription-notice-dismissed:${kind}:${periodEnd ?? 'none'}`
}
