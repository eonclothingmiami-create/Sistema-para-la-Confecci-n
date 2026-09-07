-- Calendario laboral del taller: lunes a viernes, festivos Colombia, cierres y días extra.

create table public.workshop_calendar (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  kind text not null check (kind in ('festivo', 'cierre', 'extra')),
  name text not null,
  source text not null default 'manual' check (source in ('oficial', 'manual')),
  created_at timestamptz not null default now(),
  unique (occurred_on, kind)
);

create index workshop_calendar_date_idx on public.workshop_calendar (occurred_on);

alter table public.workshop_calendar enable row level security;

create policy workshop_calendar_select_authenticated on public.workshop_calendar
  for select to authenticated using (true);
create policy workshop_calendar_insert_authenticated on public.workshop_calendar
  for insert to authenticated with check (true);
create policy workshop_calendar_update_authenticated on public.workshop_calendar
  for update to authenticated using (true) with check (true);
create policy workshop_calendar_delete_authenticated on public.workshop_calendar
  for delete to authenticated using (true);

grant select, insert, update, delete on public.workshop_calendar to authenticated;

insert into public.workshop_calendar (occurred_on, kind, name, source)
values
  ('2025-01-01', 'festivo', 'Año Nuevo', 'oficial'),
  ('2025-01-06', 'festivo', 'Día de los Reyes Magos', 'oficial'),
  ('2025-03-24', 'festivo', 'Día de San José', 'oficial'),
  ('2025-04-17', 'festivo', 'Jueves Santo', 'oficial'),
  ('2025-04-18', 'festivo', 'Viernes Santo', 'oficial'),
  ('2025-05-01', 'festivo', 'Día del Trabajo', 'oficial'),
  ('2025-06-02', 'festivo', 'Ascensión del Señor', 'oficial'),
  ('2025-06-23', 'festivo', 'Corpus Christi', 'oficial'),
  ('2025-06-30', 'festivo', 'Sagrado Corazón de Jesús / San Pedro y San Pablo', 'oficial'),
  ('2025-07-20', 'festivo', 'Independencia de Colombia', 'oficial'),
  ('2025-08-07', 'festivo', 'Batalla de Boyacá', 'oficial'),
  ('2025-08-18', 'festivo', 'Asunción de la Virgen', 'oficial'),
  ('2025-10-13', 'festivo', 'Día de la Raza', 'oficial'),
  ('2025-11-03', 'festivo', 'Todos los Santos', 'oficial'),
  ('2025-11-17', 'festivo', 'Independencia de Cartagena', 'oficial'),
  ('2025-12-08', 'festivo', 'Inmaculada Concepción', 'oficial'),
  ('2025-12-25', 'festivo', 'Navidad', 'oficial'),
  ('2026-01-01', 'festivo', 'Año Nuevo', 'oficial'),
  ('2026-01-12', 'festivo', 'Día de los Reyes Magos', 'oficial'),
  ('2026-03-23', 'festivo', 'Día de San José', 'oficial'),
  ('2026-04-02', 'festivo', 'Jueves Santo', 'oficial'),
  ('2026-04-03', 'festivo', 'Viernes Santo', 'oficial'),
  ('2026-05-01', 'festivo', 'Día del Trabajo', 'oficial'),
  ('2026-05-18', 'festivo', 'Ascensión del Señor', 'oficial'),
  ('2026-06-08', 'festivo', 'Corpus Christi', 'oficial'),
  ('2026-06-15', 'festivo', 'Sagrado Corazón de Jesús', 'oficial'),
  ('2026-06-29', 'festivo', 'San Pedro y San Pablo', 'oficial'),
  ('2026-07-20', 'festivo', 'Independencia de Colombia', 'oficial'),
  ('2026-08-07', 'festivo', 'Batalla de Boyacá', 'oficial'),
  ('2026-08-17', 'festivo', 'Asunción de la Virgen', 'oficial'),
  ('2026-10-12', 'festivo', 'Día de la Raza', 'oficial'),
  ('2026-11-02', 'festivo', 'Todos los Santos', 'oficial'),
  ('2026-11-16', 'festivo', 'Independencia de Cartagena', 'oficial'),
  ('2026-12-08', 'festivo', 'Inmaculada Concepción', 'oficial'),
  ('2026-12-25', 'festivo', 'Navidad', 'oficial'),
  ('2027-01-01', 'festivo', 'Año Nuevo', 'oficial'),
  ('2027-01-11', 'festivo', 'Día de los Reyes Magos', 'oficial'),
  ('2027-03-22', 'festivo', 'Día de San José', 'oficial'),
  ('2027-03-25', 'festivo', 'Jueves Santo', 'oficial'),
  ('2027-03-26', 'festivo', 'Viernes Santo', 'oficial'),
  ('2027-05-01', 'festivo', 'Día del Trabajo', 'oficial'),
  ('2027-05-10', 'festivo', 'Ascensión del Señor', 'oficial'),
  ('2027-05-31', 'festivo', 'Corpus Christi', 'oficial'),
  ('2027-06-07', 'festivo', 'Sagrado Corazón de Jesús', 'oficial'),
  ('2027-07-05', 'festivo', 'San Pedro y San Pablo', 'oficial'),
  ('2027-07-20', 'festivo', 'Independencia de Colombia', 'oficial'),
  ('2027-08-07', 'festivo', 'Batalla de Boyacá', 'oficial'),
  ('2027-08-16', 'festivo', 'Asunción de la Virgen', 'oficial'),
  ('2027-10-18', 'festivo', 'Día de la Raza', 'oficial'),
  ('2027-11-01', 'festivo', 'Todos los Santos', 'oficial'),
  ('2027-11-15', 'festivo', 'Independencia de Cartagena', 'oficial'),
  ('2027-12-08', 'festivo', 'Inmaculada Concepción', 'oficial'),
  ('2027-12-25', 'festivo', 'Navidad', 'oficial'),
  ('2028-01-01', 'festivo', 'Año Nuevo', 'oficial'),
  ('2028-01-10', 'festivo', 'Día de los Reyes Magos', 'oficial'),
  ('2028-03-20', 'festivo', 'Día de San José', 'oficial'),
  ('2028-04-13', 'festivo', 'Jueves Santo', 'oficial'),
  ('2028-04-14', 'festivo', 'Viernes Santo', 'oficial'),
  ('2028-05-01', 'festivo', 'Día del Trabajo', 'oficial'),
  ('2028-05-29', 'festivo', 'Ascensión del Señor', 'oficial'),
  ('2028-06-19', 'festivo', 'Corpus Christi', 'oficial'),
  ('2028-06-26', 'festivo', 'Sagrado Corazón de Jesús', 'oficial'),
  ('2028-07-03', 'festivo', 'San Pedro y San Pablo', 'oficial'),
  ('2028-07-20', 'festivo', 'Independencia de Colombia', 'oficial'),
  ('2028-08-07', 'festivo', 'Batalla de Boyacá', 'oficial'),
  ('2028-08-21', 'festivo', 'Asunción de la Virgen', 'oficial'),
  ('2028-10-16', 'festivo', 'Día de la Raza', 'oficial'),
  ('2028-11-06', 'festivo', 'Todos los Santos', 'oficial'),
  ('2028-11-13', 'festivo', 'Independencia de Cartagena', 'oficial'),
  ('2028-12-08', 'festivo', 'Inmaculada Concepción', 'oficial'),
  ('2028-12-25', 'festivo', 'Navidad', 'oficial')
on conflict (occurred_on, kind) do nothing;
