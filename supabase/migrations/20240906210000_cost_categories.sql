create table public.cost_categories (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('fijo_mes', 'variable_dia')),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (entry_type, name)
);

alter table public.cost_categories enable row level security;

create policy cost_categories_select_authenticated on public.cost_categories
  for select to authenticated using (true);
create policy cost_categories_insert_authenticated on public.cost_categories
  for insert to authenticated with check (true);
create policy cost_categories_update_authenticated on public.cost_categories
  for update to authenticated using (true) with check (true);
create policy cost_categories_delete_authenticated on public.cost_categories
  for delete to authenticated using (true);

grant select, insert, update, delete on public.cost_categories to authenticated;

insert into public.cost_categories (entry_type, name, sort_order)
values
  ('fijo_mes', 'Arriendo', 1),
  ('fijo_mes', 'Nómina taller', 2),
  ('fijo_mes', 'Nómina administrativa', 3),
  ('fijo_mes', 'Servicios', 4),
  ('fijo_mes', 'Internet', 5),
  ('fijo_mes', 'Mantenimiento de máquinas', 6),
  ('fijo_mes', 'Otro fijo', 7),
  ('variable_dia', 'Insumos', 1),
  ('variable_dia', 'Imprevisto', 2),
  ('variable_dia', 'Emergencia', 3),
  ('variable_dia', 'Invitación / detalle empleados', 4),
  ('variable_dia', 'Transporte', 5),
  ('variable_dia', 'Reparación urgente', 6),
  ('variable_dia', 'Otro', 7)
on conflict (entry_type, name) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table public.cost_categories;
  exception when duplicate_object then null;
  end;
end;
$$;
