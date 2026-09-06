-- Clientes con valor minuto pactado. Las referencias apuntan al cliente.
-- Cada orden congela el valor vigente al crearse (ajuste anual no reescribe historia).

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  minute_rate numeric(12, 4) not null default 0 check (minute_rate >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

insert into public.clients (name, minute_rate)
select distinct trim(gr.client), 0
from public.garment_references gr
where gr.client is not null and trim(gr.client) <> ''
on conflict (name) do nothing;

alter table public.garment_references
  add column client_id uuid references public.clients(id);

update public.garment_references gr
set client_id = c.id
from public.clients c
where gr.client is not null and trim(gr.client) = c.name;

alter table public.garment_references drop column client;

alter table public.production_orders
  add column minute_rate numeric(12, 4) not null default 0 check (minute_rate >= 0);

update public.production_orders po
set minute_rate = coalesce(c.minute_rate, 0)
from public.garment_references gr
left join public.clients c on c.id = gr.client_id
where po.reference_id = gr.id;

alter table public.clients enable row level security;

create policy clients_select_authenticated on public.clients
  for select to authenticated using (true);
create policy clients_insert_authenticated on public.clients
  for insert to authenticated with check (true);
create policy clients_update_authenticated on public.clients
  for update to authenticated using (true) with check (true);
create policy clients_delete_authenticated on public.clients
  for delete to authenticated using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.clients;
  exception when duplicate_object then null;
  end;
end;
$$;
