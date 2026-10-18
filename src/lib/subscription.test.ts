import { describe, expect, it } from 'vitest'
import {
  formatSubscriptionDateLong,
  getSubscriptionNotice,
  isSubscriptionReadOnly,
  type SubscriptionState,
} from './subscription'

function state(partial: Partial<SubscriptionState>): SubscriptionState {
  return {
    status: 'active',
    current_period_end: '2026-11-06',
    days_left: 10,
    grace_days: 3,
    grace_days_left: 13,
    enforcement_enabled: true,
    ...partial,
  }
}

describe('getSubscriptionNotice', () => {
  it('active no muestra aviso', () => {
    expect(getSubscriptionNotice(state({ status: 'active', days_left: 5 }))).toBeNull()
  })

  it('RPC fallido (null) → fail-open sin aviso', () => {
    expect(getSubscriptionNotice(null)).toBeNull()
  })

  it('due_soon 1 día → ámbar cerrable aunque enforcement off', () => {
    const notice = getSubscriptionNotice(
      state({
        status: 'due_soon',
        effective_status: 'due_soon',
        days_left: 1,
        current_period_end: '2026-11-06',
        enforcement_enabled: false,
      }),
    )
    expect(notice?.kind).toBe('due_tomorrow')
    expect(notice?.tone).toBe('amber')
    expect(notice?.dismissible).toBe(true)
    expect(notice?.message).toContain('vence mañana')
    expect(notice?.message).toContain(formatSubscriptionDateLong('2026-11-06'))
  })

  it('due_soon 0 días → rojo cerrable aunque enforcement off', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'due_soon', days_left: 0, enforcement_enabled: false }),
    )
    expect(notice?.kind).toBe('due_today')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(true)
    expect(notice?.message).toBe('Tu suscripción vence hoy.')
  })

  it('grace con enforcement false → sin aviso', () => {
    expect(
      getSubscriptionNotice(
        state({
          status: 'grace',
          grace_until: '2026-11-09',
          enforcement_enabled: false,
        }),
      ),
    ).toBeNull()
  })

  it('grace con enforcement true → aviso con grace_until', () => {
    const notice = getSubscriptionNotice(
      state({
        status: 'grace',
        grace_until: '2026-11-09',
        enforcement_enabled: true,
      }),
    )
    expect(notice?.kind).toBe('grace')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(false)
    expect(notice?.message).toContain('Tienes hasta el')
    expect(notice?.message).toContain(formatSubscriptionDateLong('2026-11-09'))
  })

  it('grace con message del panel lo adjunta', () => {
    const notice = getSubscriptionNotice(
      state({
        status: 'grace',
        grace_until: '2026-11-09',
        enforcement_enabled: true,
        message: 'Pago pendiente de verificación',
      }),
    )
    expect(notice?.vendorMessage).toBe('Pago pendiente de verificación')
  })

  it('suspended con enforcement false → sin aviso', () => {
    expect(
      getSubscriptionNotice(state({ status: 'suspended', enforcement_enabled: false })),
    ).toBeNull()
  })

  it('suspended con enforcement true → solo lectura genérico', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'suspended', enforcement_enabled: true }),
    )
    expect(notice?.kind).toBe('suspended')
    expect(notice?.dismissible).toBe(false)
    expect(notice?.message).toContain('solo lectura')
    expect(notice?.message).toContain('proveedor')
    expect(notice?.message.toLowerCase()).not.toContain('suspend')
  })

  it('expired con enforcement true → solo lectura genérico', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'expired', enforcement_enabled: true }),
    )
    expect(notice?.kind).toBe('expired')
    expect(notice?.message).toContain('solo lectura')
  })

  it('expired con enforcement false → sin aviso', () => {
    expect(
      getSubscriptionNotice(state({ status: 'expired', enforcement_enabled: false })),
    ).toBeNull()
  })
})

describe('isSubscriptionReadOnly', () => {
  it('true solo con suspended/expired + enforcement', () => {
    expect(isSubscriptionReadOnly(state({ status: 'expired', enforcement_enabled: true }))).toBe(true)
    expect(isSubscriptionReadOnly(state({ status: 'suspended', enforcement_enabled: true }))).toBe(true)
    expect(isSubscriptionReadOnly(state({ status: 'expired', enforcement_enabled: false }))).toBe(false)
    expect(isSubscriptionReadOnly(state({ status: 'grace', enforcement_enabled: true }))).toBe(false)
    expect(isSubscriptionReadOnly(state({ status: 'due_soon', days_left: 0, enforcement_enabled: true }))).toBe(
      false,
    )
    expect(isSubscriptionReadOnly(null)).toBe(false)
  })
})
