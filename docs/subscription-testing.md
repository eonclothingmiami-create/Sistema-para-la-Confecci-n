# Suscripción — revisión y prueba (sin sorpresas en producción)

Orden obligatorio. **No actives el candado** hasta validar cada fase.
La app del cliente solo **lee** el estado; el panel global manda la decisión.

## Cómo aplicar SQL

Las migraciones se aplican **por SQL Editor** (copiar/pegar el archivo completo).

**No uses `supabase db push`** hasta alinear el historial remoto con
`supabase migration repair` (las versiones locales son `20261018*`).

**NO re-ejecutar** `20261018010000` ni `20261018020000` **después de** `20261018040000`:
revierten `subscription_state` y los controles a versiones anteriores.
Si hace falta, volver a correr `040000` al final.

## Archivos

| Fase | Archivo | Efecto en producción |
|---|---|---|
| 1 | `supabase/migrations/20261018010000_subscription_schema.sql` | Tablas/funciones + fila `enforcement_enabled = false`. **Cero bloqueo.** |
| 1b | `supabase/migrations/20261018020000_subscription_vendor_controls.sql` | RPCs locales: set_enforcement / suspend / reactivate. |
| 2 | Frontend (este repo) | Banners + solo lectura UI + admin lazy. Fail-open si el RPC falla. |
| 3 | `supabase/migrations/20261018030000_subscription_write_policies.sql` | Políticas **RESTRICTIVE** idempotentes. |
| 4 | `supabase/migrations/20261018040000_subscription_remote_control.sql` | Columnas panel, `apply_vendor_state`, `set_grace`, eventos, estados efectivos. |
| Edge | `supabase/functions/vendor-sync` | Ver `docs/vendor-sync.md`. |
| Seed | `supabase/seed_subscription.sql` | Vendor admin (marcador en línea `v_email`). |

## Orden exacto en producción

1. SQL Editor: `20261018010000_subscription_schema.sql` (si aún no está).
2. SQL Editor: `20261018020000_subscription_vendor_controls.sql`.
3. SQL Editor: `seed_subscription.sql` (email vendor).
4. SQL Editor: `20261018040000_subscription_remote_control.sql` (modelo remoto; safe con enforcement false).
5. Desplegar frontend de `feat/suscripcion` (gh-pages / Hostinger). El cliente no nota cambio con enforcement apagado.
6. `supabase secrets set VENDOR_SYNC_SECRET=...`
7. `supabase functions deploy vendor-sync --no-verify-jwt`
8. Cuando cobres de verdad: SQL Editor `20261018030000_subscription_write_policies.sql`, luego `enforcement_enabled = true` (panel o local).

## SELECT de verificación (solo lectura / fail-open)

```sql
select
  public.subscription_state() as state,
  public.subscription_is_active() as is_active,
  (select tenant_id from public.subscription where id = '00000000-0000-4000-8000-000000000001') as tenant_id,
  (select source from public.subscription where id = '00000000-0000-4000-8000-000000000001') as source,
  (select panel_version from public.subscription where id = '00000000-0000-4000-8000-000000000001') as panel_version,
  (select enforcement_enabled from public.subscription where id = '00000000-0000-4000-8000-000000000001') as enforcement_enabled;

-- Esperado en producción segura:
-- state.effective_status in ('active','due_soon') según fecha
-- is_active = true
-- enforcement_enabled = false
```

Forzar solo lectura (sin borrar data) — solo en prueba:

```sql
update public.subscription
set enforcement_enabled = true,
    status = 'suspended',
    source = 'local';

select public.subscription_state() ->> 'effective_status'; -- suspended
select public.subscription_is_active();                   -- false

-- Volver a seguro:
update public.subscription
set enforcement_enabled = false,
    status = 'active',
    grace_until = null,
    message = null,
    current_period_end = '2026-11-06';
```

## 1. Aplicar fase 1 (SQL Editor)

```sql
select public.subscription_state();
select public.subscription_is_active();
```

## 2. Controles vendor (1b)

Ejecuta `20261018020000_subscription_vendor_controls.sql`.

## 3. Seed vendor admin

Reemplaza solo el marcador en la línea `v_email` de `seed_subscription.sql`.

## 4. Fase 4 — control remoto

Ejecuta `20261018040000_subscription_remote_control.sql`.

## 5. Frontend

Con enforcement apagado:

- Luis ve avisos el día 5 (vence mañana) y el día 6 (vence hoy)
- grace/suspended/expired **no** bloquean
- toast de escritura denegada solo con suspended/expired + enforcement
- `#/admin/suscripcion` solo vendor admin (chunk lazy)

## 6. Edge function

Ver `docs/vendor-sync.md`.

## 7. Fase 3 (candado RLS) — solo cuando apruebes

Ejecuta `20261018030000_subscription_write_policies.sql`.

## 8. Controles de emergencia

En `#/admin/suscripcion` (vendor): origen Panel/Local, sincronización, gracia, suspender, reactivar, eventos.
