-- Sistema para la Confección — schema inicial
-- TODO(prod): endurecer políticas RLS por profiles.role (admin / supervisor / consulta).
-- v1: cualquier usuario autenticado puede hacer CRUD.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'supervisor' check (role in ('admin', 'supervisor', 'consulta')),
  created_at timestamptz not null default now()
);

create table public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  document text,
  position text,
  line text,
  hire_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.garment_references (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  garment_type text,
  client text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reference_operations (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid not null references public.garment_references(id) on delete cascade,
  operation_number integer not null,
  operation_name text not null,
  machine_type text,
  standard_minutes numeric(10, 4) not null check (standard_minutes > 0),
  sort_order integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reference_id, operation_number)
);

create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  reference_id uuid not null references public.garment_references(id),
  total_quantity integer not null check (total_quantity > 0),
  start_date date,
  estimated_end_date date,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'terminada', 'pausada')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_production_headers (
  id uuid primary key default gen_random_uuid(),
  production_date date not null,
  operator_id uuid not null references public.operators(id),
  production_order_id uuid not null references public.production_orders(id),
  installed_capacity_minutes numeric(10, 2) not null default 510 check (installed_capacity_minutes > 0),
  start_time time,
  end_time time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_date, operator_id, production_order_id)
);

create table public.daily_production_entries (
  id uuid primary key default gen_random_uuid(),
  header_id uuid not null references public.daily_production_headers(id) on delete cascade,
  reference_operation_id uuid not null references public.reference_operations(id),
  delivered_units integer not null default 0 check (delivered_units >= 0),
  defective_units integer not null default 0 check (defective_units >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (header_id, reference_operation_id)
);

-- ---------------------------------------------------------------------------
-- Indexes (FKs and common filters)
-- ---------------------------------------------------------------------------

create index operators_active_idx on public.operators (active);
create index operators_code_idx on public.operators (code);

create index garment_references_active_idx on public.garment_references (active);

create index reference_operations_reference_id_idx on public.reference_operations (reference_id);
create index reference_operations_active_idx on public.reference_operations (active);

create index production_orders_reference_id_idx on public.production_orders (reference_id);
create index production_orders_status_idx on public.production_orders (status);

create index daily_production_headers_operator_id_idx on public.daily_production_headers (operator_id);
create index daily_production_headers_production_order_id_idx on public.daily_production_headers (production_order_id);
create index daily_production_headers_production_date_idx on public.daily_production_headers (production_date);

create index daily_production_entries_header_id_idx on public.daily_production_entries (header_id);
create index daily_production_entries_reference_operation_id_idx on public.daily_production_entries (reference_operation_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger operators_set_updated_at
  before update on public.operators
  for each row execute function public.set_updated_at();

create trigger garment_references_set_updated_at
  before update on public.garment_references
  for each row execute function public.set_updated_at();

create trigger reference_operations_set_updated_at
  before update on public.reference_operations
  for each row execute function public.set_updated_at();

create trigger production_orders_set_updated_at
  before update on public.production_orders
  for each row execute function public.set_updated_at();

create trigger daily_production_headers_set_updated_at
  before update on public.daily_production_headers
  for each row execute function public.set_updated_at();

create trigger daily_production_entries_set_updated_at
  before update on public.daily_production_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'supervisor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS still applies)
-- ---------------------------------------------------------------------------

create or replace view public.production_entry_calculations
with (security_invoker = true) as
select
  e.id as entry_id,
  e.header_id,
  h.production_date,
  h.operator_id,
  h.production_order_id,
  e.reference_operation_id,
  e.delivered_units,
  e.defective_units,
  o.standard_minutes,
  (e.delivered_units * o.standard_minutes) as delivered_minutes
from public.daily_production_entries e
join public.daily_production_headers h on h.id = e.header_id
join public.reference_operations o on o.id = e.reference_operation_id;

create or replace view public.daily_operator_efficiency
with (security_invoker = true) as
select
  h.production_date,
  h.operator_id,
  op.name as operator_name,
  h.production_order_id,
  po.order_number,
  po.reference_id,
  gr.code as reference_code,
  gr.name as reference_name,
  h.installed_capacity_minutes,
  coalesce(sum(e.delivered_units), 0) as total_delivered_units,
  coalesce(sum(e.defective_units), 0) as total_defective_units,
  coalesce(sum(e.delivered_units * ro.standard_minutes), 0) as total_delivered_minutes,
  case
    when h.installed_capacity_minutes > 0
      then (coalesce(sum(e.delivered_units * ro.standard_minutes), 0) / h.installed_capacity_minutes) * 100
    else 0
  end as efficiency_percentage
from public.daily_production_headers h
join public.operators op on op.id = h.operator_id
join public.production_orders po on po.id = h.production_order_id
join public.garment_references gr on gr.id = po.reference_id
left join public.daily_production_entries e on e.header_id = h.id
left join public.reference_operations ro on ro.id = e.reference_operation_id
group by
  h.id,
  h.production_date,
  h.operator_id,
  op.name,
  h.production_order_id,
  po.order_number,
  po.reference_id,
  gr.code,
  gr.name,
  h.installed_capacity_minutes;

-- Misma forma que daily_operator_efficiency; el frontend filtra por fecha.
create or replace view public.dashboard_today_operator_efficiency
with (security_invoker = true) as
select * from public.daily_operator_efficiency;

create or replace view public.reference_efficiency
with (security_invoker = true) as
select
  d.production_date,
  d.reference_id,
  d.reference_code,
  d.reference_name,
  sum(d.total_delivered_units) as total_delivered_units,
  sum(d.total_defective_units) as total_defective_units,
  sum(d.total_delivered_minutes) as total_delivered_minutes,
  case
    when sum(d.installed_capacity_minutes) > 0
      then (sum(d.total_delivered_minutes) / sum(d.installed_capacity_minutes)) * 100
    else 0
  end as efficiency_percentage
from public.daily_operator_efficiency d
group by d.production_date, d.reference_id, d.reference_code, d.reference_name;

create or replace view public.order_efficiency
with (security_invoker = true) as
select
  d.production_date,
  d.production_order_id,
  d.order_number,
  d.reference_id,
  d.reference_code,
  d.reference_name,
  sum(d.total_delivered_units) as total_delivered_units,
  sum(d.total_defective_units) as total_defective_units,
  sum(d.total_delivered_minutes) as total_delivered_minutes,
  case
    when sum(d.installed_capacity_minutes) > 0
      then (sum(d.total_delivered_minutes) / sum(d.installed_capacity_minutes)) * 100
    else 0
  end as efficiency_percentage
from public.daily_operator_efficiency d
group by
  d.production_date,
  d.production_order_id,
  d.order_number,
  d.reference_id,
  d.reference_code,
  d.reference_name;

-- ---------------------------------------------------------------------------
-- RLS
-- v1: CRUD para authenticated.
-- TODO(prod): restringir delete/update por role.
--   admin      -> CRUD completo
--   supervisor -> select/insert/update (sin delete de catálogos)
--   consulta   -> solo select
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.operators enable row level security;
alter table public.garment_references enable row level security;
alter table public.reference_operations enable row level security;
alter table public.production_orders enable row level security;
alter table public.daily_production_headers enable row level security;
alter table public.daily_production_entries enable row level security;

-- profiles
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);
create policy profiles_insert_authenticated on public.profiles
  for insert to authenticated with check (true);
create policy profiles_update_authenticated on public.profiles
  for update to authenticated using (true) with check (true);
create policy profiles_delete_authenticated on public.profiles
  for delete to authenticated using (true);

-- operators
create policy operators_select_authenticated on public.operators
  for select to authenticated using (true);
create policy operators_insert_authenticated on public.operators
  for insert to authenticated with check (true);
create policy operators_update_authenticated on public.operators
  for update to authenticated using (true) with check (true);
create policy operators_delete_authenticated on public.operators
  for delete to authenticated using (true);

-- garment_references
create policy garment_references_select_authenticated on public.garment_references
  for select to authenticated using (true);
create policy garment_references_insert_authenticated on public.garment_references
  for insert to authenticated with check (true);
create policy garment_references_update_authenticated on public.garment_references
  for update to authenticated using (true) with check (true);
create policy garment_references_delete_authenticated on public.garment_references
  for delete to authenticated using (true);

-- reference_operations
create policy reference_operations_select_authenticated on public.reference_operations
  for select to authenticated using (true);
create policy reference_operations_insert_authenticated on public.reference_operations
  for insert to authenticated with check (true);
create policy reference_operations_update_authenticated on public.reference_operations
  for update to authenticated using (true) with check (true);
create policy reference_operations_delete_authenticated on public.reference_operations
  for delete to authenticated using (true);

-- production_orders
create policy production_orders_select_authenticated on public.production_orders
  for select to authenticated using (true);
create policy production_orders_insert_authenticated on public.production_orders
  for insert to authenticated with check (true);
create policy production_orders_update_authenticated on public.production_orders
  for update to authenticated using (true) with check (true);
create policy production_orders_delete_authenticated on public.production_orders
  for delete to authenticated using (true);

-- daily_production_headers
create policy daily_production_headers_select_authenticated on public.daily_production_headers
  for select to authenticated using (true);
create policy daily_production_headers_insert_authenticated on public.daily_production_headers
  for insert to authenticated with check (true);
create policy daily_production_headers_update_authenticated on public.daily_production_headers
  for update to authenticated using (true) with check (true);
create policy daily_production_headers_delete_authenticated on public.daily_production_headers
  for delete to authenticated using (true);

-- daily_production_entries
create policy daily_production_entries_select_authenticated on public.daily_production_entries
  for select to authenticated using (true);
create policy daily_production_entries_insert_authenticated on public.daily_production_entries
  for insert to authenticated with check (true);
create policy daily_production_entries_update_authenticated on public.daily_production_entries
  for update to authenticated using (true) with check (true);
create policy daily_production_entries_delete_authenticated on public.daily_production_entries
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.daily_production_headers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.daily_production_entries;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.operators;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.production_orders;
  exception when duplicate_object then null;
  end;
end;
$$;
