# Suscripción — revisión y prueba (sin sorpresas en producción)

Orden obligatorio. **No actives el candado** hasta validar cada fase.

## Cómo aplicar SQL

Las migraciones se aplican **por SQL Editor** (copiar/pegar el archivo completo).

**No uses `supabase db push`** hasta alinear el historial remoto con
`supabase migration repair` (las versiones locales son `20261018*`).

## Archivos

| Fase | Archivo | Efecto en producción |
|---|---|---|
| 1 | `supabase/migrations/20261018010000_subscription_schema.sql` | Solo añade tablas/funciones + fila con `enforcement_enabled = false`. **Cero bloqueo.** |
| 2 | Frontend (este repo) | Banner: avisos de **1 día / hoy** siempre por fecha. grace/expired solo con enforcement. Solo lectura en UI al vencer. |
| 3 | `supabase/migrations/20261018030000_subscription_write_policies.sql` | Políticas **RESTRICTIVE** nuevas (`*_sub_write_*`). No reemplaza políticas existentes. Con enforcement apagado **sigue permitiendo escritura**. |
| Seed | `supabase/seed_subscription.sql` | Vendor admin: reemplaza `<<EMAIL_PROVEEDOR>>` |

## 1. Aplicar fase 1 (SQL Editor)

Copia y ejecuta `20261018010000_subscription_schema.sql`.

```sql
select public.subscription_state();
-- enforcement_enabled = false, status = active, current_period_end = 2026-11-06

select public.subscription_is_active();
-- true
```

## 2. Registrar vendor admin

1. Abre `supabase/seed_subscription.sql`
2. Reemplaza `<<EMAIL_PROVEEDOR>>` por el email real
3. Ejecuta en SQL Editor

## 3. Desplegar frontend (cuando apruebes)

Con enforcement apagado:

- Luis **sí** ve avisos el día 5 (vence mañana) y el día 6 (vence hoy)
- grace/expired **no** bloquean ni muestran pantalla de bloqueo
- toast «suscripción vencida» **solo** si `expired` + `enforcement_enabled=true`

## 4. Probar estados de aviso (enforcement aún false)

```sql
-- ACTIVE, varios días → sin banner
update public.subscription
set current_period_end = ((timezone('America/Bogota', now()))::date + 10),
    status = 'active',
    grace_days = 3,
    enforcement_enabled = false;

-- Vence mañana (days_left = 1) → banner ámbar SIEMPRE
update public.subscription
set current_period_end = ((timezone('America/Bogota', now()))::date + 1);

-- Vence hoy (days_left = 0) → banner rojo SIEMPRE
update public.subscription
set current_period_end = (timezone('America/Bogota', now()))::date;

-- Grace / expired con enforcement false → sin banner de bloqueo
update public.subscription
set current_period_end = ((timezone('America/Bogota', now()))::date - 1);
```

## 5. Aplicar fase 3 (candado RLS) — solo cuando apruebes

Ejecuta `20261018030000_subscription_write_policies.sql`.

Con `enforcement_enabled = false` la escritura **sigue permitida**.

Para probar solo lectura de verdad:

```sql
update public.subscription
set enforcement_enabled = true,
    current_period_end = ((timezone('America/Bogota', now()))::date - 5),
    status = 'active',
    grace_days = 3;
```

- Banner rojo fijo (no tapa la app)
- Botones guardar/editar/borrar deshabilitados
- Si algo intenta escribir: toast «La suscripción está vencida…»
- SELECT sigue OK

## 6. Volver a producción segura

```sql
update public.subscription
set current_period_end = '2026-11-06',
    status = 'active',
    grace_days = 3,
    enforcement_enabled = false;
```

Cuando cobres de verdad:

```sql
update public.subscription set enforcement_enabled = true;
```

## 7. Registrar pago (vendor)

En `#/admin/suscripcion`, o con JWT de vendor:

```sql
select public.register_payment(
  ((timezone('America/Bogota', now()))::date + 30),
  150000,
  'transferencia',
  'PRUEBA-001'
);
```
