# Suscripción — revisión y prueba (sin sorpresas en producción)

Orden obligatorio. **No actives el candado** hasta validar cada fase.

## Archivos

| Fase | Archivo | Efecto en producción |
|---|---|---|
| 1 | `supabase/migrations/20241018010000_subscription_schema.sql` | Solo añade tablas/funciones + fila con `enforcement_enabled = false`. **Cero bloqueo.** |
| 2 | Frontend (este repo) | Banner/página admin. Con `enforcement_enabled = false` **no muestra avisos**. Si el RPC falla, la app sigue normal. |
| 3 | `supabase/migrations/20241018030000_subscription_write_policies.sql` | Añade `subscription_is_active()` a INSERT/UPDATE/DELETE. Con enforcement apagado **sigue permitiendo escritura**. |
| Seed | `supabase/seed_subscription.sql` | Vendor admin + verificación |

## 1. Aplicar fase 1 (SQL Editor)

Copia y ejecuta el contenido de `20241018010000_subscription_schema.sql`.

Comprueba:

```sql
select public.subscription_state();
-- enforcement_enabled = false, status = active, current_period_end = 2026-11-06

select public.subscription_is_active();
-- true
```

El taller **no debe notar nada**.

## 2. Registrar vendor admin

Ejecuta `supabase/seed_subscription.sql` (ajusta el email si hace falta).

Luego, con esa cuenta, abre `#/admin/suscripcion`.

## 3. Desplegar frontend

Publica el build. Con enforcement apagado: sin banners, sin pantallas de vencido, escritura normal.

## 4. Probar estados (solo en staging o con enforcement aún en false)

Los avisos de UI solo aparecen si `enforcement_enabled = true`. Para probar UI sin bloquear escritura:

```sql
-- Activa solo avisos de UI; las políticas aún fall-open si no aplicaste fase 3
update public.subscription
set enforcement_enabled = true,
    current_period_end = ((timezone('America/Bogota', now()))::date + 10),
    status = 'active',
    grace_days = 3;
-- sin banner

update public.subscription
set current_period_end = ((timezone('America/Bogota', now()))::date + 1);
-- banner ámbar: vence mañana

update public.subscription
set current_period_end = (timezone('America/Bogota', now()))::date;
-- banner rojo: vence hoy

update public.subscription
set current_period_end = ((timezone('America/Bogota', now()))::date - 1);
-- grace (rojo, no dismissible)

update public.subscription
set current_period_end = ((timezone('America/Bogota', now()))::date - 5);
-- expired (pantalla completa admin / mensaje operario)
```

Recarga o reenfoca la ventana tras cada `update`.

## 5. Aplicar fase 3 (candado RLS) — solo cuando apruebes

Ejecuta `20241018030000_subscription_write_policies.sql`.

Con `enforcement_enabled = false` la escritura **sigue permitida**.

Para probar solo lectura de verdad:

```sql
update public.subscription
set enforcement_enabled = true,
    current_period_end = ((timezone('America/Bogota', now()))::date - 5),
    status = 'active',
    grace_days = 3;
```

Intenta crear/editar un cliente: RLS `42501` → toast
«La suscripción está vencida; no se pueden guardar cambios». SELECT sigue OK.

## 6. Volver a producción segura

```sql
update public.subscription
set current_period_end = '2026-11-06',
    status = 'active',
    grace_days = 3,
    enforcement_enabled = false;
```

Cuando quieras cobrar de verdad, deja la fecha correcta y:

```sql
update public.subscription set enforcement_enabled = true;
```

## 7. Registrar pago (vendor)

En `#/admin/suscripcion`, o (con JWT de vendor):

```sql
select public.register_payment(
  ((timezone('America/Bogota', now()))::date + 30),
  150000,
  'transferencia',
  'PRUEBA-001'
);
```

Desde SQL Editor sin JWT de vendor, usa `update` directo de `current_period_end`.
