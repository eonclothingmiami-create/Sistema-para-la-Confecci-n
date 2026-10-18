-- Fase 4 (aditiva): control remoto desde panel global + eventos + gracia explícita.
-- Requiere 20261018010000 y 20261018020000.
-- Aplicar MANUALMENTE por SQL Editor. NO usar `supabase db push`.

-- ---------------------------------------------------------------------------
-- Columnas de sincronización
-- ---------------------------------------------------------------------------
alter table public.subscription
  add column if not exists tenant_id text;

alter table public.subscription
  add column if not exists grace_until date;

alter table public.subscription
  add column if not exists message text;

alter table public.subscription
  add column if not exists source text not null default 'local';

alter table public.subscription
  drop constraint if exists subscription_source_check;

alter table public.subscription
  add constraint subscription_source_check
  check (source in ('local', 'panel'));

alter table public.subscription
  add column if not exists last_synced_at timestamptz;

alter table public.subscription
  add column if not exists panel_version bigint not null default 0;

update public.subscription
set tenant_id = coalesce(nullif(trim(tenant_id), ''), 'luis-confeccion')
where id = '00000000-0000-4000-8000-000000000001'::uuid;

-- ---------------------------------------------------------------------------
-- Eventos (auditoría)
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  source text not null check (source in ('local', 'panel')),
  actor text,
  old_state jsonb,
  new_state jsonb
);

create index if not exists subscription_events_at_idx
  on public.subscription_events (at desc);

alter table public.subscription_events enable row level security;

drop policy if exists subscription_events_select_vendor on public.subscription_events;
create policy subscription_events_select_vendor on public.subscription_events
  for select to authenticated
  using ((select public.is_vendor_admin()));

-- Sin políticas de insert/update/delete para authenticated/anon:
-- solo SECURITY DEFINER / service_role escriben.

revoke all on table public.subscription_events from anon;
grant select on table public.subscription_events to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.subscription_snapshot(rec public.subscription)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', rec.id,
    'tenant_id', rec.tenant_id,
    'plan', rec.plan,
    'status', rec.status,
    'current_period_end', rec.current_period_end,
    'grace_days', rec.grace_days,
    'grace_until', rec.grace_until,
    'enforcement_enabled', rec.enforcement_enabled,
    'message', rec.message,
    'source', rec.source,
    'last_synced_at', rec.last_synced_at,
    'panel_version', rec.panel_version,
    'notes', rec.notes,
    'updated_at', rec.updated_at
  );
$$;

create or replace function public.log_subscription_event(
  p_source text,
  p_actor text,
  p_old jsonb,
  p_new jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscription_events (source, actor, old_state, new_state)
  values (p_source, p_actor, p_old, p_new);
end;
$$;

revoke all on function public.log_subscription_event(text, text, jsonb, jsonb) from public;
revoke all on function public.log_subscription_event(text, text, jsonb, jsonb) from anon;
revoke all on function public.log_subscription_event(text, text, jsonb, jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- subscription_state (effective statuses)
-- ---------------------------------------------------------------------------
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
  grace_end date;
  days_left_in_grace integer;
begin
  today_bogota := (timezone('America/Bogota', now()))::date;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid;

  -- Fail-open: sin fila → no bloquear UI ni escritura.
  if not found then
    return json_build_object(
      'status', 'active',
      'effective_status', 'active',
      'stored_status', null,
      'plan', null,
      'current_period_end', null,
      'days_left', 999,
      'grace_days', 0,
      'grace_days_left', 0,
      'grace_until', null,
      'days_left_in_grace', 0,
      'message', null,
      'enforcement_enabled', false,
      'source', 'local',
      'last_synced_at', null,
      'tenant_id', null,
      'panel_version', 0
    );
  end if;

  days_left := (rec.current_period_end - today_bogota);

  grace_end := coalesce(
    rec.grace_until,
    case
      when rec.current_period_end is null then null
      else rec.current_period_end + coalesce(rec.grace_days, 0)
    end
  );

  days_left_in_grace := case
    when grace_end is null then 0
    else greatest(0, grace_end - today_bogota)
  end;

  if rec.status = 'suspended' then
    effective := 'suspended';
  elsif rec.status = 'cancelled' then
    effective := 'expired';
  elsif rec.status = 'past_due' then
    if grace_end is not null and today_bogota > grace_end then
      effective := 'expired';
    else
      effective := 'grace';
    end if;
  elsif today_bogota <= rec.current_period_end then
    if days_left in (0, 1) then
      effective := 'due_soon';
    else
      effective := 'active';
    end if;
  elsif grace_end is not null and today_bogota <= grace_end then
    effective := 'grace';
  else
    effective := 'expired';
  end if;

  return json_build_object(
    'status', effective,
    'effective_status', effective,
    'stored_status', rec.status,
    'plan', rec.plan,
    'current_period_end', rec.current_period_end,
    'days_left', days_left,
    'grace_days', rec.grace_days,
    'grace_days_left', days_left_in_grace,
    'grace_until', grace_end,
    'days_left_in_grace', days_left_in_grace,
    'message', rec.message,
    'enforcement_enabled', coalesce(rec.enforcement_enabled, false),
    'source', coalesce(rec.source, 'local'),
    'last_synced_at', rec.last_synced_at,
    'tenant_id', rec.tenant_id,
    'panel_version', coalesce(rec.panel_version, 0)
  );
end;
$$;

revoke all on function public.subscription_state() from public;
revoke all on function public.subscription_state() from anon;
grant execute on function public.subscription_state() to authenticated;

-- Fail-open: sin fila o enforcement apagado → true.
-- Activo si effective in (active, due_soon, grace).
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
    else coalesce(
      (public.subscription_state() ->> 'effective_status') in ('active', 'due_soon', 'grace'),
      true
    )
  end;
$$;

revoke all on function public.subscription_is_active() from public;
revoke all on function public.subscription_is_active() from anon;
grant execute on function public.subscription_is_active() to authenticated;

-- ---------------------------------------------------------------------------
-- apply_vendor_state (solo service_role)
-- ---------------------------------------------------------------------------
create or replace function public.apply_vendor_state(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  old_snap jsonb;
  new_snap jsonb;
  v_tenant text;
  v_status text;
  v_period_end date;
  v_grace_until date;
  v_enforcement boolean;
  v_message text;
  v_version bigint;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload inválido' using errcode = '22023';
  end if;

  v_tenant := nullif(trim(coalesce(p_payload ->> 'tenant_id', '')), '');
  v_status := nullif(trim(coalesce(p_payload ->> 'status', '')), '');
  v_period_end := (p_payload ->> 'current_period_end')::date;
  v_grace_until := nullif(p_payload ->> 'grace_until', '')::date;
  v_enforcement := coalesce((p_payload ->> 'enforcement_enabled')::boolean, false);
  v_message := nullif(p_payload ->> 'message', '');
  v_version := coalesce((p_payload ->> 'panel_version')::bigint, 0);

  if v_tenant is null then
    raise exception 'tenant_id es obligatorio' using errcode = '22023';
  end if;

  if v_status is null or v_status not in ('active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'status inválido' using errcode = '22023';
  end if;

  if v_period_end is null then
    raise exception 'current_period_end es obligatorio' using errcode = '22023';
  end if;

  if v_version <= 0 then
    raise exception 'panel_version debe ser > 0' using errcode = '22023';
  end if;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  if coalesce(rec.tenant_id, '') is distinct from v_tenant then
    raise exception 'tenant_id no coincide' using errcode = '42501';
  end if;

  if v_version <= coalesce(rec.panel_version, 0) then
    raise exception 'panel_version obsoleto o repetido' using errcode = '22023';
  end if;

  old_snap := public.subscription_snapshot(rec);

  update public.subscription
  set
    status = v_status,
    current_period_end = v_period_end,
    grace_until = v_grace_until,
    enforcement_enabled = v_enforcement,
    message = v_message,
    source = 'panel',
    last_synced_at = now(),
    panel_version = v_version,
    updated_at = now()
  where id = rec.id
  returning * into rec;

  new_snap := public.subscription_snapshot(rec);
  perform public.log_subscription_event('panel', 'panel', old_snap, new_snap);

  return public.subscription_state();
end;
$$;

revoke all on function public.apply_vendor_state(jsonb) from public;
revoke all on function public.apply_vendor_state(jsonb) from anon;
revoke all on function public.apply_vendor_state(jsonb) from authenticated;
grant execute on function public.apply_vendor_state(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Controles locales (respaldo) — source = local + eventos
-- ---------------------------------------------------------------------------
create or replace function public.set_enforcement(p_enabled boolean)
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  old_snap jsonb;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede cambiar el enforcement'
      using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'p_enabled es obligatorio' using errcode = '22023';
  end if;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  old_snap := public.subscription_snapshot(rec);

  update public.subscription
  set
    enforcement_enabled = p_enabled,
    source = 'local',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = rec.id
  returning * into rec;

  perform public.log_subscription_event(
    'local',
    coalesce((select auth.uid())::text, 'local'),
    old_snap,
    public.subscription_snapshot(rec)
  );

  return rec;
end;
$$;

revoke all on function public.set_enforcement(boolean) from public;
revoke all on function public.set_enforcement(boolean) from anon;
grant execute on function public.set_enforcement(boolean) to authenticated;

create or replace function public.suspend_subscription()
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  old_snap jsonb;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede suspender la suscripción'
      using errcode = '42501';
  end if;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  old_snap := public.subscription_snapshot(rec);

  update public.subscription
  set
    status = 'suspended',
    source = 'local',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = rec.id
  returning * into rec;

  perform public.log_subscription_event(
    'local',
    coalesce((select auth.uid())::text, 'local'),
    old_snap,
    public.subscription_snapshot(rec)
  );

  return rec;
end;
$$;

revoke all on function public.suspend_subscription() from public;
revoke all on function public.suspend_subscription() from anon;
grant execute on function public.suspend_subscription() to authenticated;

create or replace function public.reactivate_subscription()
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  old_snap jsonb;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede reactivar la suscripción'
      using errcode = '42501';
  end if;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  old_snap := public.subscription_snapshot(rec);

  update public.subscription
  set
    status = 'active',
    grace_until = null,
    message = null,
    source = 'local',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = rec.id
  returning * into rec;

  perform public.log_subscription_event(
    'local',
    coalesce((select auth.uid())::text, 'local'),
    old_snap,
    public.subscription_snapshot(rec)
  );

  return rec;
end;
$$;

revoke all on function public.reactivate_subscription() from public;
revoke all on function public.reactivate_subscription() from anon;
grant execute on function public.reactivate_subscription() to authenticated;

create or replace function public.set_grace(p_until date)
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
  old_snap jsonb;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede poner en gracia'
      using errcode = '42501';
  end if;

  if p_until is null then
    raise exception 'p_until es obligatorio' using errcode = '22023';
  end if;

  select * into rec
  from public.subscription
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  old_snap := public.subscription_snapshot(rec);

  update public.subscription
  set
    status = 'past_due',
    grace_until = p_until,
    source = 'local',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = rec.id
  returning * into rec;

  perform public.log_subscription_event(
    'local',
    coalesce((select auth.uid())::text, 'local'),
    old_snap,
    public.subscription_snapshot(rec)
  );

  return rec;
end;
$$;

revoke all on function public.set_grace(date) from public;
revoke all on function public.set_grace(date) from anon;
grant execute on function public.set_grace(date) to authenticated;

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
  old_snap jsonb;
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

  old_snap := public.subscription_snapshot(rec);

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
    grace_until = null,
    message = null,
    source = 'local',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = rec.id
  returning * into rec;

  perform public.log_subscription_event(
    'local',
    coalesce((select auth.uid())::text, 'local'),
    old_snap,
    public.subscription_snapshot(rec)
  );

  return payment;
end;
$$;

revoke all on function public.register_payment(date, numeric, text, text) from public;
revoke all on function public.register_payment(date, numeric, text, text) from anon;
grant execute on function public.register_payment(date, numeric, text, text) to authenticated;
