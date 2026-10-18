# vendor-sync — contrato para el panel global

Endpoint Edge Function que escribe el estado de membresía en la app del cliente.
La tabla `public.subscription` es una **copia local**; la decisión vive en el panel.

## Despliegue (no es `db push`)

```bash
# Secret compartido con el panel
supabase secrets set VENDOR_SYNC_SECRET="REEMPLAZA_CON_SECRETO_LARGO"

# Opcional: origen del panel si algún día llamas desde browser (server-to-server no lo necesita)
# supabase secrets set VENDOR_PANEL_ORIGIN="https://tu-panel.example.com"

# Deploy sin JWT de Supabase (la auth es HMAC propia)
supabase functions deploy vendor-sync --no-verify-jwt
```

URL típica:

`https://<PROJECT_REF>.supabase.co/functions/v1/vendor-sync`

## Autenticación

Headers obligatorios:

| Header | Valor |
|---|---|
| `X-Vendor-Timestamp` | Unix epoch en **segundos** (también acepta ms o ISO) |
| `X-Vendor-Signature` | Hex HMAC-SHA256 del payload canónico (o prefijo `sha256=`) |
| `Content-Type` | `application/json` (POST) |

### Payload firmado

```
HMAC_SHA256(secret, `${timestamp}.${method}.${rawBody}`) → hex
```

- `timestamp`: el **mismo string** enviado en `X-Vendor-Timestamp`
- `method`: verbo HTTP en mayúsculas (`GET` / `POST`)
- `rawBody`: cuerpo crudo; en **GET** es la cadena vacía `""`
- Rechazo si el timestamp difiere más de **5 minutos** (anti-replay)
- Comparación de firma en **tiempo constante**
- Alterar el timestamp invalida la firma (no se puede reutilizar un GET firmado con otro timestamp)

### Ejemplo Node (panel)

```js
import crypto from 'node:crypto'

const secret = process.env.VENDOR_SYNC_SECRET
const method = 'POST'
const body = JSON.stringify({
  tenant_id: 'luis-confeccion',
  status: 'past_due',
  current_period_end: '2026-11-06',
  grace_until: '2026-11-09',
  enforcement_enabled: true,
  message: 'Pago pendiente',
  panel_version: 3,
})
const timestamp = String(Math.floor(Date.now() / 1000))
const signingPayload = `${timestamp}.${method}.${body}`
const signature = crypto.createHmac('sha256', secret).update(signingPayload).digest('hex')

await fetch(PROCESS_URL, {
  method,
  headers: {
    'Content-Type': 'application/json',
    'X-Vendor-Timestamp': timestamp,
    'X-Vendor-Signature': signature,
  },
  body,
})
```

### Ejemplo curl (GET estado)

```bash
SECRET="..."
URL="https://<PROJECT_REF>.supabase.co/functions/v1/vendor-sync"
TS=$(date +%s)
BODY=""
PAYLOAD="${TS}.GET.${BODY}"
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -sS "$URL" \
  -H "X-Vendor-Timestamp: $TS" \
  -H "X-Vendor-Signature: $SIG"
```

### Ejemplo curl (POST)

```bash
SECRET="..."
URL="https://<PROJECT_REF>.supabase.co/functions/v1/vendor-sync"
TS=$(date +%s)
BODY='{"tenant_id":"luis-confeccion","status":"active","current_period_end":"2026-12-01","grace_until":null,"enforcement_enabled":false,"message":null,"panel_version":4}'
PAYLOAD="${TS}.POST.${BODY}"
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Vendor-Timestamp: $TS" \
  -H "X-Vendor-Signature: $SIG" \
  -d "$BODY"
```

## CORS

Por defecto **sin CORS** (servidor → servidor).  
Si defines `VENDOR_PANEL_ORIGIN`, solo ese origen recibe `Access-Control-Allow-Origin`.

## POST — aplicar estado

Body JSON:

```json
{
  "tenant_id": "luis-confeccion",
  "status": "active | past_due | suspended | cancelled",
  "current_period_end": "YYYY-MM-DD",
  "grace_until": "YYYY-MM-DD | null",
  "enforcement_enabled": true,
  "message": "texto opcional | null",
  "panel_version": 1
}
```

### Códigos de error (fijos; sin detalle SQL/zod al cliente)

| Código HTTP | `error` | Cuándo |
|---|---|---|
| 200 | — | `{ ok: true, state: <subscription_state()> }` |
| 400 | `validation_error` | JSON/zod inválido |
| 400 | `apply_failed` | fallo al aplicar (detalle solo en logs) |
| 401 | `missing_headers` / `bad_timestamp` / `timestamp_skew` / `bad_signature` | Auth |
| 403 | `tenant_mismatch` | tenant distinto |
| 409 | `stale_panel_version` | version ≤ guardada |
| 404 | `apply_failed` | sin fila de suscripción |
| 500 | `internal_error` | env / error interno |

El detalle de Postgres/zod se registra con `console.error` en la función.

## GET — leer estado (sin datos de negocio)

Misma firma HMAC sobre `rawBody = ""` y `method = GET`.

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

## Lógica compartida

La verificación vive en `supabase/functions/_shared/vendor-sync-auth.ts` y la cubren los tests Vitest del mismo directorio.
