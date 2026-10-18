# vendor-sync — contrato para el panel global

Endpoint Edge Function que escribe el estado de membresía en la app del cliente.
La tabla `public.subscription` es una **copia local**; la decisión vive en el panel.

## Despliegue (no es `db push`)

```bash
# 1) Secret compartido con el panel (genera uno fuerte)
supabase secrets set VENDOR_SYNC_SECRET="REEMPLAZA_CON_SECRETO_LARGO"

# 2) Deploy sin JWT de Supabase (la auth es HMAC propia)
supabase functions deploy vendor-sync --no-verify-jwt
```

URL típica:

`https://<PROJECT_REF>.supabase.co/functions/v1/vendor-sync`

## Autenticación

Headers obligatorios:

| Header | Valor |
|---|---|
| `X-Vendor-Timestamp` | Unix epoch en **segundos** (también acepta ms o ISO) |
| `X-Vendor-Signature` | Hex HMAC-SHA256 del **body exacto** (o prefijo opcional `sha256=`) |
| `Content-Type` | `application/json` (POST) |

- Rechazo si el timestamp difiere más de **5 minutos** del reloj del servidor (anti-replay).
- Comparación de firma en **tiempo constante**.
- **GET**: el body firmado es la cadena vacía `""`.
- **POST**: firma el JSON crudo tal cual se envía (mismo string, mismos espacios).

### Ejemplo Node (panel)

```js
import crypto from 'node:crypto'

const secret = process.env.VENDOR_SYNC_SECRET
const body = JSON.stringify({
  tenant_id: 'luis-confeccion',
  status: 'past_due',
  current_period_end: '2026-11-06',
  grace_until: '2026-11-09',
  enforcement_enabled: true,
  message: 'Pago pendiente',
  panel_version: 3,
})
const ts = Math.floor(Date.now() / 1000)
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')

await fetch(PROCESS_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Vendor-Timestamp': String(ts),
    'X-Vendor-Signature': signature,
  },
  body,
})
```

## POST — aplicar estado

Body JSON:

```json
{
  "tenant_id": "luis-confeccion",
  "status": "active | past_due | suspended | cancelled",
  "current_period_end": "YYYY-MM-DD",
  "grace_until": "YYYY-MM-DD | null",
  "enforcement_enabled": true,
  "message": "texto opcional para el banner | null",
  "panel_version": 1
}
```

Reglas:

- `tenant_id` debe coincidir con `subscription.tenant_id`.
- `panel_version` debe ser **estrictamente mayor** al guardado.
- Escribe vía `public.apply_vendor_state` (solo `service_role`).
- Deja `source = 'panel'` y `last_synced_at = now()`.
- Registra fila en `subscription_events`.

### Respuestas

| Código | `error` | Cuándo |
|---|---|---|
| 200 | — | `{ ok: true, state: <subscription_state()> }` |
| 400 | `validation_error` / mensaje SQL | JSON/zod inválido |
| 401 | `missing_signature_or_timestamp`, `bad_timestamp`, `timestamp_skew`, `bad_signature` | Auth |
| 403 | `tenant_mismatch` | tenant distinto |
| 409 | `stale_panel_version` | version ≤ guardada |
| 404 | `subscription_missing` | sin fila |
| 500 | `server_misconfigured` / otro | env / interno |

## GET — leer estado (sin datos de negocio)

Misma firma HMAC sobre body vacío.

Respuesta 200 (ejemplo):

```json
{
  "tenant_id": "luis-confeccion",
  "status": "past_due",
  "effective_status": "grace",
  "current_period_end": "2026-11-06",
  "grace_until": "2026-11-09",
  "days_left": -1,
  "days_left_in_grace": 2,
  "enforcement_enabled": true,
  "message": "Pago pendiente",
  "source": "panel",
  "last_synced_at": "2026-10-18T21:00:00.000Z",
  "panel_version": 3
}
```

No incluye tablas del taller (órdenes, producción, etc.).

## Estados efectivos en la app

Calculados por `subscription_state()` (America/Bogota):

| effective_status | Significado |
|---|---|
| `active` | Vigente, >1 día |
| `due_soon` | 1 o 0 días al vencimiento |
| `grace` | `past_due` o dentro de `grace_until` / `grace_days` |
| `suspended` | `status = suspended` |
| `expired` | Pasó la gracia / cancelled |

`subscription_is_active()` es **fail-open**: `true` si no hay fila, si `enforcement_enabled = false`, o si el efectivo es `active` / `due_soon` / `grace`. Solo `false` en `suspended` / `expired` con enforcement encendido.
