/** Firma HMAC y validación de requests del endpoint vendor-sync (testable en Node/Vitest). */

const MAX_SKEW_MS = 5 * 60 * 1000

export function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = a.toLowerCase()
  const bb = b.toLowerCase()
  if (aa.length !== bb.length) return false
  let out = 0
  for (let i = 0; i < aa.length; i += 1) {
    out |= aa.charCodeAt(i) ^ bb.charCodeAt(i)
  }
  return out === 0
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export type VendorSyncPayload = {
  tenant_id: string
  status: 'active' | 'past_due' | 'suspended' | 'cancelled'
  current_period_end: string
  grace_until?: string | null
  enforcement_enabled: boolean
  message?: string | null
  panel_version: number
}

export type AuthFailureReason =
  | 'missing_headers'
  | 'bad_timestamp'
  | 'timestamp_skew'
  | 'bad_signature'
  | 'stale_panel_version'
  | 'tenant_mismatch'

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: AuthFailureReason; status: number }

export function parseVendorTimestamp(header: string | null | undefined): number | null {
  if (!header) return null
  const asNum = Number(header)
  if (Number.isFinite(asNum) && asNum > 0) {
    // segundos o ms
    return asNum < 1e12 ? asNum * 1000 : asNum
  }
  const asDate = Date.parse(header)
  return Number.isFinite(asDate) ? asDate : null
}

export async function verifyVendorSignature(opts: {
  secret: string
  body: string
  signatureHeader: string | null | undefined
  timestampHeader: string | null | undefined
  nowMs?: number
}): Promise<AuthResult> {
  const { secret, body, signatureHeader, timestampHeader, nowMs = Date.now() } = opts
  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: 'missing_headers', status: 401 }
  }

  const ts = parseVendorTimestamp(timestampHeader)
  if (ts == null) {
    return { ok: false, reason: 'bad_timestamp', status: 401 }
  }

  if (Math.abs(nowMs - ts) > MAX_SKEW_MS) {
    return { ok: false, reason: 'timestamp_skew', status: 401 }
  }

  const expected = await hmacSha256Hex(secret, body)
  const provided = signatureHeader.replace(/^sha256=/i, '').trim()
  if (!timingSafeEqualHex(expected, provided)) {
    return { ok: false, reason: 'bad_signature', status: 401 }
  }

  return { ok: true }
}

/** Validaciones de negocio antes de llamar a apply_vendor_state. */
export function validateVendorPayloadAgainstRow(
  payload: VendorSyncPayload,
  row: { tenant_id: string | null; panel_version: number },
): AuthResult {
  if (!row.tenant_id || row.tenant_id !== payload.tenant_id) {
    return { ok: false, reason: 'tenant_mismatch', status: 403 }
  }
  if (payload.panel_version <= row.panel_version) {
    return { ok: false, reason: 'stale_panel_version', status: 409 }
  }
  return { ok: true }
}
