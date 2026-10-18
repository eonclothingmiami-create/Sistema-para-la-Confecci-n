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
  it('active con más de 1 día no muestra aviso', () => {
    expect(getSubscriptionNotice(state({ status: 'active', days_left: 5 }))).toBeNull()
  })

  it('faltan 1 día → aviso ámbar aunque enforcement esté apagado', () => {
    const notice = getSubscriptionNotice(
      state({
        status: 'active',
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

  it('vence hoy → aviso rojo aunque enforcement esté apagado', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'active', days_left: 0, enforcement_enabled: false }),
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
          days_left: -1,
          grace_days_left: 2,
          enforcement_enabled: false,
        }),
      ),
    ).toBeNull()
  })

  it('grace con enforcement true → aviso rojo no dismissible', () => {
    const notice = getSubscriptionNotice(
      state({
        status: 'grace',
        days_left: -1,
        grace_days_left: 2,
        current_period_end: '2026-11-06',
        enforcement_enabled: true,
      }),
    )
    expect(notice?.kind).toBe('grace')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(false)
    expect(notice?.message).toContain('venció el')
    expect(notice?.message).toContain('2 días')
  })

  it('expired con enforcement false → sin aviso', () => {
    expect(
      getSubscriptionNotice(
        state({ status: 'expired', days_left: -10, grace_days_left: 0, enforcement_enabled: false }),
      ),
    ).toBeNull()
  })

  it('expired con enforcement true → aviso rojo no dismissible', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'expired', days_left: -10, grace_days_left: 0, enforcement_enabled: true }),
    )
    expect(notice?.kind).toBe('expired')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(false)
  })
})

describe('isSubscriptionReadOnly', () => {
  it('solo true con expired + enforcement', () => {
    expect(isSubscriptionReadOnly(state({ status: 'expired', enforcement_enabled: true }))).toBe(true)
    expect(isSubscriptionReadOnly(state({ status: 'expired', enforcement_enabled: false }))).toBe(false)
    expect(isSubscriptionReadOnly(state({ status: 'grace', enforcement_enabled: true }))).toBe(false)
    expect(isSubscriptionReadOnly(null)).toBe(false)
  })
})
