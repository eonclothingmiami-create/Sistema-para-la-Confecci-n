import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { z } from "npm:zod@3"
import {
  validateVendorPayloadAgainstRow,
  verifyVendorSignature,
} from "../_shared/vendor-sync-auth.ts"

const payloadSchema = z.object({
  tenant_id: z.string().min(1),
  status: z.enum(["active", "past_due", "suspended", "cancelled"]),
  current_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grace_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  enforcement_enabled: z.boolean(),
  message: z.string().nullable().optional(),
  panel_version: z.number().int().positive(),
})

function corsHeaders(): Record<string, string> {
  const origin = Deno.env.get("VENDOR_PANEL_ORIGIN")?.trim()
  if (!origin) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "content-type, x-vendor-signature, x-vendor-timestamp",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(),
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
      const headers = corsHeaders()
      if (!Object.keys(headers).length) {
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 204, headers })
    }

    const secret = Deno.env.get("VENDOR_SYNC_SECRET")
    if (!secret) {
      console.error("vendor-sync: VENDOR_SYNC_SECRET missing")
      return json({ error: "internal_error" }, 500)
    }

    const rawBody = req.method === "GET" ? "" : await req.text()
    const auth = await verifyVendorSignature({
      secret,
      method: req.method,
      rawBody,
      signatureHeader: req.headers.get("x-vendor-signature"),
      timestampHeader: req.headers.get("x-vendor-timestamp"),
    })
    if (!auth.ok) {
      console.error("vendor-sync: auth failed", auth.reason)
      return json({ error: auth.reason }, auth.status)
    }

    const supabase = serviceClient()

    if (req.method === "GET") {
      const { data, error } = await supabase.rpc("subscription_state")
      if (error) {
        console.error("vendor-sync: subscription_state failed", error)
        return json({ error: "internal_error" }, 500)
      }
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
      return json({ error: "validation_error" }, 405)
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody || "{}")
    } catch (err) {
      console.error("vendor-sync: invalid json", err)
      return json({ error: "validation_error" }, 400)
    }

    const parsed = payloadSchema.safeParse(parsedJson)
    if (!parsed.success) {
      console.error("vendor-sync: zod validation", parsed.error.flatten())
      return json({ error: "validation_error" }, 400)
    }

    const payload = parsed.data

    const { data: row, error: rowError } = await supabase
      .from("subscription")
      .select("tenant_id, panel_version")
      .eq("id", "00000000-0000-4000-8000-000000000001")
      .maybeSingle()

    if (rowError) {
      console.error("vendor-sync: read subscription failed", rowError)
      return json({ error: "internal_error" }, 500)
    }
    if (!row) {
      console.error("vendor-sync: subscription row missing")
      return json({ error: "apply_failed" }, 404)
    }

    const precheck = validateVendorPayloadAgainstRow(payload, {
      tenant_id: row.tenant_id,
      panel_version: Number(row.panel_version ?? 0),
    })
    if (!precheck.ok) {
      console.error("vendor-sync: precheck failed", precheck.reason)
      return json({ error: precheck.reason }, precheck.status)
    }

    const { data, error } = await supabase.rpc("apply_vendor_state", {
      p_payload: payload,
    })

    if (error) {
      console.error("vendor-sync: apply_vendor_state failed", error)
      const msg = error.message ?? ""
      if (/tenant_id no coincide/i.test(msg)) {
        return json({ error: "tenant_mismatch" }, 403)
      }
      if (/panel_version obsoleto/i.test(msg)) {
        return json({ error: "stale_panel_version" }, 409)
      }
      return json({ error: "apply_failed" }, 400)
    }

    return json({ ok: true, state: data })
  } catch (err) {
    console.error("vendor-sync: unhandled", err)
    return json({ error: "internal_error" }, 500)
  }
})
