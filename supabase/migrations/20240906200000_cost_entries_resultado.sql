-- Resultado del taller: fijos mensuales, variables diarios, ingreso por minuto del lote.

create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('fijo_mes', 'variable_dia')),
  occurred_on date not null,
  category text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  notes text,
  production_order_id uuid references public.production_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger cost_entries_set_updated_at
  before update on public.cost_entries
  for each row execute function public.set_updated_at();

create index cost_entries_type_date_idx on public.cost_entries (entry_type, occurred_on);
create index cost_entries_order_idx on public.cost_entries (production_order_id);

create unique index cost_entries_fixed_month_category_idx
  on public.cost_entries (occurred_on, category)
  where entry_type = 'fijo_mes';

alter table public.cost_entries enable row level security;

create policy cost_entries_select_authenticated on public.cost_entries
  for select to authenticated using (true);
create policy cost_entries_insert_authenticated on public.cost_entries
  for insert to authenticated with check (true);
create policy cost_entries_update_authenticated on public.cost_entries
  for update to authenticated using (true) with check (true);
create policy cost_entries_delete_authenticated on public.cost_entries
  for delete to authenticated using (true);

create or replace view public.daily_production_revenue
with (security_invoker = true) as
select
  h.production_date,
  h.production_order_id,
  po.order_number,
  coalesce(po.minute_rate, 0) as minute_rate,
  coalesce(sum(e.delivered_units * ro.standard_minutes), 0) as delivered_minutes,
  coalesce(sum(e.delivered_units * ro.standard_minutes), 0) * coalesce(po.minute_rate, 0) as revenue
from public.daily_production_headers h
join public.production_orders po on po.id = h.production_order_id
left join public.daily_production_entries e on e.header_id = h.id
left join public.reference_operations ro on ro.id = e.reference_operation_id
group by
  h.production_date,
  h.production_order_id,
  po.order_number,
  po.minute_rate;

do $$
begin
  begin
    alter publication supabase_realtime add table public.cost_entries;
  exception when duplicate_object then null;
  end;
end;
$$;
