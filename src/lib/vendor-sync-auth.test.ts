import { describe, expect, it } from 'vitest'
import {
  hmacSha256Hex,
  validateVendorPayloadAgainstRow,
  verifyVendorSignature,
  type VendorSyncPayload,
} from './vendor-sync-auth'

const secret = 'test-vendor-sync-secret'
const body = JSON.stringify({
  tenant_id: 'luis-confeccion',
  status: 'active',
  current_period_end: '2026-12-01',
  grace_until: null,
  enforcement_enabled: false,
  message: null,
  panel_version: 2,
} satisfies VendorSyncPayload)

describe('vendor-sync HMAC', () => {
  it('acepta firma válida y timestamp reciente', async () => {
    const now = Date.now()
    const signature = await hmacSha256Hex(secret, body)
    const result = await verifyVendorSignature({
      secret,
      body,
      signatureHeader: signature,
      timestampHeader: String(Math.floor(now / 1000)),
      nowMs: now,
    })
    expect(result).toEqual({ ok: true })
  })

  it('rechaza firma inválida', async () => {
    const now = Date.now()
    const result = await verifyVendorSignature({
      secret,
      body,
      signatureHeader: 'deadbeef',
      timestampHeader: String(Math.floor(now / 1000)),
      nowMs: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_signature')
  })

  it('rechaza timestamp viejo (>5 min)', async () => {
    const now = Date.now()
    const signature = await hmacSha256Hex(secret, body)
    const result = await verifyVendorSignature({
      secret,
      body,
      signatureHeader: `sha256=${signature}`,
      timestampHeader: String(Math.floor((now - 6 * 60 * 1000) / 1000)),
      nowMs: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('timestamp_skew')
  })

  it('rechaza panel_version repetido o menor', () => {
    const payload: VendorSyncPayload = {
      tenant_id: 'luis-confeccion',
      status: 'active',
      current_period_end: '2026-12-01',
      enforcement_enabled: true,
      panel_version: 5,
    }
    const stale = validateVendorPayloadAgainstRow(payload, {
      tenant_id: 'luis-confeccion',
      panel_version: 5,
    })
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.reason).toBe('stale_panel_version')

    const older = validateVendorPayloadAgainstRow({ ...payload, panel_version: 4 }, {
      tenant_id: 'luis-confeccion',
      panel_version: 5,
    })
    expect(older.ok).toBe(false)
  })

  it('rechaza tenant_id distinto', () => {
    const result = validateVendorPayloadAgainstRow(
      {
        tenant_id: 'otra-app',
        status: 'suspended',
        current_period_end: '2026-12-01',
        enforcement_enabled: true,
        panel_version: 10,
      },
      { tenant_id: 'luis-confeccion', panel_version: 1 },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('tenant_mismatch')
  })
})
