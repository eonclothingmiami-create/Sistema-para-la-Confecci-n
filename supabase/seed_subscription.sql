-- Semilla vendor admin (SQL Editor, bypass RLS).
-- 1) Reemplaza <<EMAIL_PROVEEDOR>> por el correo real del vendor.
-- 2) Ejecuta el script completo.
-- La fila de subscription ya se inserta en 20261018010000_subscription_schema.sql.

do $$
declare
  v_email text := '<<EMAIL_PROVEEDOR>>';
  v_user_id uuid;
begin
  if v_email is null
     or btrim(v_email) = ''
     or v_email = '<<EMAIL_PROVEEDOR>>'
     or position('@' in v_email) = 0 then
    raise exception
      'Reemplaza <<EMAIL_PROVEEDOR>> por el email del vendor antes de ejecutar este seed';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(btrim(v_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No existe usuario en auth.users con email %', v_email;
  end if;

  insert into public.vendor_admins (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end $$;

-- Asegura la fila de suscripción (idempotente; no enciende enforcement)
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
