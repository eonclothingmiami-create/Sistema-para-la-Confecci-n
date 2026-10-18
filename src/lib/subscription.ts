export type SubscriptionEffectiveStatus = 'active' | 'grace' | 'expired'

export type SubscriptionState = {
  status: SubscriptionEffectiveStatus
  stored_status?: string | null
  plan?: string | null
  current_period_end: string | null
  days_left: number
  grace_days: number
  grace_days_left: number
  /** Si es false, no hay avisos ni bloqueo de UI (fail-open en producción). */
  enforcement_enabled?: boolean
}

export type SubscriptionNoticeKind = 'due_tomorrow' | 'due_today' | 'grace' | 'expired'

export type SubscriptionNotice = {
  kind: SubscriptionNoticeKind
  tone: 'amber' | 'red'
  dismissible: boolean
  message: string
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

export function getSubscriptionNotice(state: SubscriptionState | null | undefined): SubscriptionNotice | null {
  if (!state) return null
  // Fail-open: sin enforcement no se muestra nada al cliente.
  if (state.enforcement_enabled !== true) return null

  if (state.status === 'expired') {
    return {
      kind: 'expired',
      tone: 'red',
      dismissible: false,
      message: state.current_period_end
        ? `Tu suscripción venció el ${formatSubscriptionDateLong(state.current_period_end)}.`
        : 'Tu suscripción está vencida.',
    }
  }

  if (state.status === 'grace') {
    const n = Math.max(0, state.grace_days_left)
    return {
      kind: 'grace',
      tone: 'red',
      dismissible: false,
      message: `Tu suscripción venció el ${formatSubscriptionDateLong(state.current_period_end)}. Tienes ${n} día${n === 1 ? '' : 's'} antes de que la app quede en solo lectura.`,
    }
  }

  // active
  if (state.days_left === 1) {
    return {
      kind: 'due_tomorrow',
      tone: 'amber',
      dismissible: true,
      message: `Tu suscripción vence mañana, ${formatSubscriptionDateLong(state.current_period_end)}.`,
    }
  }

  if (state.days_left === 0) {
    return {
      kind: 'due_today',
      tone: 'red',
      dismissible: true,
      message: 'Tu suscripción vence hoy.',
    }
  }

  return null
}

export function isSubscriptionWriteDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : ''
  return code === '42501' || /row-level security|permission denied|violates row-level security/i.test(message)
}

export const SUBSCRIPTION_WRITE_DENIED_MESSAGE =
  'La suscripción está vencida; no se pueden guardar cambios'

export const VENDOR_CONTACT = {
  title: 'Renovación de suscripción',
  name: 'Soporte — Sistema para la Confección',
  email: 'eonclothingmiami@gmail.com',
  phone: '',
  note: 'Escribe indicando el nombre del taller y el comprobante de pago.',
} as const

export function dismissNoticeStorageKey(kind: SubscriptionNoticeKind, periodEnd: string | null): string {
  return `subscription-notice-dismissed:${kind}:${periodEnd ?? 'none'}`
}
