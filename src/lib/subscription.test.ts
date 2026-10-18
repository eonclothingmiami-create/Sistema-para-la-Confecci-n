import { describe, expect, it } from 'vitest'
import { formatSubscriptionDateLong, getSubscriptionNotice, type SubscriptionState } from './subscription'

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
  it('sin enforcement no muestra aviso (fail-open)', () => {
    expect(
      getSubscriptionNotice(state({ enforcement_enabled: false, status: 'expired', days_left: 0 })),
    ).toBeNull()
  })

  it('active con más de 1 día no muestra aviso', () => {
    expect(getSubscriptionNotice(state({ status: 'active', days_left: 5 }))).toBeNull()
  })

  it('faltan 1 día → aviso ámbar dismissible', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'active', days_left: 1, current_period_end: '2026-11-06' }),
    )
    expect(notice?.kind).toBe('due_tomorrow')
    expect(notice?.tone).toBe('amber')
    expect(notice?.dismissible).toBe(true)
    expect(notice?.message).toContain('vence mañana')
    expect(notice?.message).toContain(formatSubscriptionDateLong('2026-11-06'))
  })

  it('vence hoy → aviso rojo dismissible', () => {
    const notice = getSubscriptionNotice(state({ status: 'active', days_left: 0 }))
    expect(notice?.kind).toBe('due_today')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(true)
    expect(notice?.message).toBe('Tu suscripción vence hoy.')
  })

  it('grace → aviso rojo no dismissible con días restantes', () => {
    const notice = getSubscriptionNotice(
      state({
        status: 'grace',
        days_left: -1,
        grace_days_left: 2,
        current_period_end: '2026-11-06',
      }),
    )
    expect(notice?.kind).toBe('grace')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(false)
    expect(notice?.message).toContain('venció el')
    expect(notice?.message).toContain('2 días')
  })

  it('expired → aviso rojo no dismissible', () => {
    const notice = getSubscriptionNotice(
      state({ status: 'expired', days_left: -10, grace_days_left: 0 }),
    )
    expect(notice?.kind).toBe('expired')
    expect(notice?.tone).toBe('red')
    expect(notice?.dismissible).toBe(false)
  })
})
