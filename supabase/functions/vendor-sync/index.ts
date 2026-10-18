import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { z } from "npm:zod@3"

const MAX_SKEW_MS = 5 * 60 * 1000

const payloadSchema = z.object({
  tenant_id: z.string().min(1),
  status: z.enum(["active", "past_due", "suspended", "cancelled"]),
  current_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grace_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  enforcement_enabled: z.boolean(),
  message: z.string().nullable().optional(),
  panel_version: z.number().int().positive(),
})

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = a.toLowerCase()
  const bb = b.toLowerCase()
  if (aa.length !== bb.length) return false
  let out = 0
  for (let i = 0; i < aa.length; i += 1) {
    out |= aa.charCodeAt(i) ^ bb.charCodeAt(i)
  }
  return out === 0
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body))
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function parseVendorTimestamp(header: string | null): number | null {
  if (!header) return null
  const asNum = Number(header)
  if (Number.isFinite(asNum) && asNum > 0) {
    return asNum < 1e12 ? asNum * 1000 : asNum
  }
  const asDate = Date.parse(header)
  return Number.isFinite(asDate) ? asDate : null
}

async function verifyRequest(
  secret: string,
  body: string,
  req: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const signatureHeader = req.headers.get("x-vendor-signature")
  const timestampHeader = req.headers.get("x-vendor-timestamp")
  if (!signatureHeader || !timestampHeader) {
    return { ok: false, status: 401, error: "missing_signature_or_timestamp" }
  }

  const ts = parseVendorTimestamp(timestampHeader)
  if (ts == null) {
    return { ok: false, status: 401, error: "bad_timestamp" }
  }
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return { ok: false, status: 401, error: "timestamp_skew" }
  }

  const expected = await hmacSha256Hex(secret, body)
  const provided = signatureHeader.replace(/^sha256=/i, "").trim()
  if (!timingSafeEqualHex(expected, provided)) {
    return { ok: false, status: 401, error: "bad_signature" }
  }
  return { ok: true }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) {
    throw new Error("missing_supabase_env")
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type, x-vendor-signature, x-vendor-timestamp",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      })
    }

    const secret = Deno.env.get("VENDOR_SYNC_SECRET")
    if (!secret) {
      return json({ error: "server_misconfigured" }, 500)
    }

    const bodyText = req.method === "GET" ? "" : await req.text()
    const auth = await verifyRequest(secret, bodyText, req)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const supabase = serviceClient()

    if (req.method === "GET") {
      const { data, error } = await supabase.rpc("subscription_state")
      if (error) return json({ error: error.message }, 500)
      const state = data as Record<string, unknown>
      return json({
        tenant_id: state.tenant_id ?? null,
        status: state.stored_status ?? null,
        effective_status: state.effective_status ?? state.status ?? null,
        current_period_end: state.current_period_end ?? null,
        grace_until: state.grace_until ?? null,
        days_left: state.days_left ?? null,
        days_left_in_grace: state.days_left_in_grace ?? null,
        enforcement_enabled: state.enforcement_enabled ?? false,
        message: state.message ?? null,
        source: state.source ?? null,
        last_synced_at: state.last_synced_at ?? null,
        panel_version: state.panel_version ?? 0,
      })
    }

    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405)
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(bodyText || "{}")
    } catch {
      return json({ error: "invalid_json" }, 400)
    }

    const parsed = payloadSchema.safeParse(parsedJson)
    if (!parsed.success) {
      return json({ error: "validation_error", details: parsed.error.flatten() }, 400)
    }

    const payload = parsed.data

    const { data: row, error: rowError } = await supabase
      .from("subscription")
      .select("tenant_id, panel_version")
      .eq("id", "00000000-0000-4000-8000-000000000001")
      .maybeSingle()

    if (rowError) return json({ error: rowError.message }, 500)
    if (!row) return json({ error: "subscription_missing" }, 404)

    if (row.tenant_id !== payload.tenant_id) {
      return json({ error: "tenant_mismatch" }, 403)
    }
    if (payload.panel_version <= Number(row.panel_version ?? 0)) {
      return json({ error: "stale_panel_version" }, 409)
    }

    const { data, error } = await supabase.rpc("apply_vendor_state", {
      p_payload: payload,
    })

    if (error) {
      const msg = error.message ?? "apply_failed"
      if (/tenant_id no coincide/i.test(msg)) return json({ error: "tenant_mismatch" }, 403)
      if (/panel_version obsoleto/i.test(msg)) return json({ error: "stale_panel_version" }, 409)
      return json({ error: msg }, 400)
    }

    return json({ ok: true, state: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal_error"
    return json({ error: message }, 500)
  }
})
