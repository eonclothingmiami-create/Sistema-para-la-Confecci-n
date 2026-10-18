import { describe, expect, it } from 'vitest'
import {
  signVendorRequest,
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

describe('vendor-sync HMAC (shared)', () => {
  it('acepta firma válida con timestamp.method.body', async () => {
    const now = Date.now()
    const timestamp = String(Math.floor(now / 1000))
    const signature = await signVendorRequest({
      secret,
      timestamp,
      method: 'POST',
      rawBody: body,
    })
    const result = await verifyVendorSignature({
      secret,
      method: 'POST',
      rawBody: body,
      signatureHeader: signature,
      timestampHeader: timestamp,
      nowMs: now,
    })
    expect(result).toEqual({ ok: true })
  })

  it('rechaza firma si el timestamp del header fue alterado', async () => {
    const now = Date.now()
    const signedTs = String(Math.floor(now / 1000))
    const alteredTs = String(Math.floor(now / 1000) + 30)
    const signature = await signVendorRequest({
      secret,
      timestamp: signedTs,
      method: 'POST',
      rawBody: body,
    })
    const result = await verifyVendorSignature({
      secret,
      method: 'POST',
      rawBody: body,
      signatureHeader: signature,
      timestampHeader: alteredTs,
      nowMs: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_signature')
  })

  it('GET firmado no se puede reutilizar con otro timestamp', async () => {
    const now = Date.now()
    const signedTs = String(Math.floor(now / 1000))
    const otherTs = String(Math.floor(now / 1000) + 10)
    const signature = await signVendorRequest({
      secret,
      timestamp: signedTs,
      method: 'GET',
      rawBody: '',
    })
    const result = await verifyVendorSignature({
      secret,
      method: 'GET',
      rawBody: '',
      signatureHeader: `sha256=${signature}`,
      timestampHeader: otherTs,
      nowMs: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_signature')
  })

  it('rechaza firma inválida', async () => {
    const now = Date.now()
    const timestamp = String(Math.floor(now / 1000))
    const result = await verifyVendorSignature({
      secret,
      method: 'POST',
      rawBody: body,
      signatureHeader: 'deadbeef',
      timestampHeader: timestamp,
      nowMs: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_signature')
  })

  it('rechaza timestamp viejo (>5 min)', async () => {
    const now = Date.now()
    const timestamp = String(Math.floor((now - 6 * 60 * 1000) / 1000))
    const signature = await signVendorRequest({
      secret,
      timestamp,
      method: 'POST',
      rawBody: body,
    })
    const result = await verifyVendorSignature({
      secret,
      method: 'POST',
      rawBody: body,
      signatureHeader: signature,
      timestampHeader: timestamp,
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
  })
})
