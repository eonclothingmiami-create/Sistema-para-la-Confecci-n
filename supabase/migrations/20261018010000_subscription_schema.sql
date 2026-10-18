-- Fase 1 (solo aditiva): membresía / suscripción.
-- NO toca tablas ni políticas de negocio existentes.
-- enforcement_enabled = false → fail-open: la app sigue escribiendo con normalidad.
-- Aplicar MANUALMENTE por SQL Editor. NO usar `supabase db push` hasta alinear
-- el historial remoto con `supabase migration repair` (versiones 2026*).
-- NO re-ejecutar después de 20261018040000: revierte subscription_state y los
-- controles a versiones anteriores. Si hace falta, volver a correr 040000 al final.

create table if not exists public.vendor_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.vendor_admins enable row level security;

create or replace function public.is_vendor_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vendor_admins v
    where v.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_vendor_admin() from public;
revoke all on function public.is_vendor_admin() from anon;
grant execute on function public.is_vendor_admin() to authenticated;

drop policy if exists vendor_admins_select_self_or_vendor on public.vendor_admins;
create policy vendor_admins_select_self_or_vendor on public.vendor_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_vendor_admin()));

drop policy if exists vendor_admins_write_vendor on public.vendor_admins;
create policy vendor_admins_write_vendor on public.vendor_admins
  for all to authenticated
  using ((select public.is_vendor_admin()))
  with check ((select public.is_vendor_admin()));

-- Una sola fila por instalación
create table if not exists public.subscription (
  id uuid primary key default '00000000-0000-4000-8000-000000000001'::uuid,
  plan text not null default 'standard',
  status text not null default 'active'
    check (status in ('active', 'past_due', 'suspended', 'cancelled')),
  current_period_end date not null,
  grace_days int not null default 3 check (grace_days >= 0),
  enforcement_enabled boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  constraint subscription_singleton check (id = '00000000-0000-4000-8000-000000000001'::uuid)
);

-- Por si la tabla ya existía sin la columna (re-aplicación segura)
alter table public.subscription
  add column if not exists enforcement_enabled boolean not null default false;

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  paid_at date not null default ((timezone('America/Bogota', now()))::date),
  amount numeric(14, 2) not null check (amount >= 0),
  method text,
  reference text,
  period_start date,
  period_end date not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists subscription_payments_paid_at_idx
  on public.subscription_payments (paid_at desc);

alter table public.subscription enable row level security;
alter table public.subscription_payments enable row level security;

-- Lectura: admin / desarrollador de la app, o vendor.
create or replace function public.is_subscription_reader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.current_app_role()) in ('admin', 'desarrollador')
    or (select public.is_vendor_admin());
$$;

revoke all on function public.is_subscription_reader() from public;
revoke all on function public.is_subscription_reader() from anon;
grant execute on function public.is_subscription_reader() to authenticated;

drop policy if exists subscription_select_admin on public.subscription;
create policy subscription_select_admin on public.subscription
  for select to authenticated
  using ((select public.is_subscription_reader()));

drop policy if exists subscription_write_vendor on public.subscription;
create policy subscription_write_vendor on public.subscription
  for all to authenticated
  using ((select public.is_vendor_admin()))
  with check ((select public.is_vendor_admin()));

drop policy if exists subscription_payments_select_admin on public.subscription_payments;
create policy subscription_payments_select_admin on public.subscription_payments
  for select to authenticated
  using ((select public.is_subscription_reader()));

drop policy if exists subscription_payments_write_vendor on public.subscription_payments;
create policy subscription_payments_write_vendor on public.subscription_payments
  for all to authenticated
  using ((select public.is_vendor_admin()))
  with check ((select public.is_vendor_admin()));

create or replace function public.subscription_state()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  today_bogota date;
  effective text;
  days_left integer;
  grace_days_left integer;
begin
  today_bogota := (timezone('America/Bogota', now()))::date;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid;

  -- Fail-open: sin fila → no bloquear UI ni escritura.
  if not found then
    return json_build_object(
      'status', 'active',
      'stored_status', null,
      'plan', null,
      'current_period_end', null,
      'days_left', 999,
      'grace_days', 0,
      'grace_days_left', 0,
      'enforcement_enabled', false
    );
  end if;

  days_left := (rec.current_period_end - today_bogota);
  grace_days_left := greatest(0, (rec.current_period_end + rec.grace_days) - today_bogota);

  if rec.status = 'suspended' then
    effective := 'expired';
  elsif today_bogota <= rec.current_period_end then
    effective := 'active';
  elsif today_bogota <= (rec.current_period_end + rec.grace_days) then
    effective := 'grace';
  else
    effective := 'expired';
  end if;

  return json_build_object(
    'status', effective,
    'stored_status', rec.status,
    'plan', rec.plan,
    'current_period_end', rec.current_period_end,
    'days_left', days_left,
    'grace_days', rec.grace_days,
    'grace_days_left', grace_days_left,
    'enforcement_enabled', coalesce(rec.enforcement_enabled, false)
  );
end;
$$;

revoke all on function public.subscription_state() from public;
revoke all on function public.subscription_state() from anon;
grant execute on function public.subscription_state() to authenticated;

-- Fail-open: sin fila o enforcement_enabled = false → siempre true.
create or replace function public.subscription_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.subscription s
      where s.id = '00000000-0000-4000-8000-000000000001'::uuid
    ) then true
    when coalesce(
      (
        select s.enforcement_enabled
        from public.subscription s
        where s.id = '00000000-0000-4000-8000-000000000001'::uuid
      ),
      false
    ) is distinct from true then true
    else coalesce((public.subscription_state() ->> 'status') in ('active', 'grace'), true)
  end;
$$;

revoke all on function public.subscription_is_active() from public;
revoke all on function public.subscription_is_active() from anon;
grant execute on function public.subscription_is_active() to authenticated;

drop function if exists public.register_payment(date, numeric, text, text);

create or replace function public.register_payment(
  p_period_end date,
  p_amount numeric,
  p_method text default null,
  p_reference text default null
)
returns public.subscription_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  payment public.subscription_payments%rowtype;
  today_bogota date;
  period_start date;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede registrar pagos'
      using errcode = '42501';
  end if;

  if p_period_end is null then
    raise exception 'p_period_end es obligatorio' using errcode = '22023';
  end if;

  today_bogota := (timezone('America/Bogota', now()))::date;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  if p_period_end < rec.current_period_end then
    raise exception 'p_period_end debe ser >= current_period_end actual'
      using errcode = '22023';
  end if;

  period_start := case
    when today_bogota <= rec.current_period_end then rec.current_period_end + 1
    else today_bogota
  end;

  insert into public.subscription_payments (
    paid_at,
    amount,
    method,
    reference,
    period_start,
    period_end,
    created_by
  )
  values (
    today_bogota,
    p_amount,
    nullif(trim(coalesce(p_method, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    period_start,
    p_period_end,
    (select auth.uid())
  )
  returning * into payment;

  update public.subscription
  set
    current_period_end = p_period_end,
    status = 'active',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = rec.id;

  return payment;
end;
$$;

revoke all on function public.register_payment(date, numeric, text, text) from public;
revoke all on function public.register_payment(date, numeric, text, text) from anon;
grant execute on function public.register_payment(date, numeric, text, text) to authenticated;

-- Fila inicial (producción segura: enforcement apagado)
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
on conflict (id) do nothing;
