-- Semilla opcional / vendor admin.
-- La fila de subscription YA se inserta en 20241018010000_subscription_schema.sql
-- (current_period_end = 2026-11-06, enforcement_enabled = false).
-- Ejecutar esto en el SQL Editor (bypass RLS) para registrarte como vendor.

-- Asegura la fila (idempotente)
insert into public.subscription (
  id,
  plan,
  status,
  current_period_end,
  grace_days,
  enforcement_enabled,
  notes
)
values (
  '00000000-0000-4000-8000-000000000001',
  'standard',
  'active',
  '2026-11-06',
  3,
  false,
  'Instalación inicial'
)
on conflict (id) do update
set
  current_period_end = coalesce(public.subscription.current_period_end, excluded.current_period_end),
  updated_at = now();

-- Vendor admin: reemplaza el email si hace falta
insert into public.vendor_admins (user_id)
select u.id
from auth.users u
where lower(u.email) = lower('davidkaseo@hotmail.com')
on conflict (user_id) do nothing;

-- Verificación
select
  s.current_period_end,
  s.status,
  s.enforcement_enabled,
  public.subscription_state() as state,
  public.subscription_is_active() as is_active
from public.subscription s
where s.id = '00000000-0000-4000-8000-000000000001';

select u.email, v.user_id
from public.vendor_admins v
join auth.users u on u.id = v.user_id;
