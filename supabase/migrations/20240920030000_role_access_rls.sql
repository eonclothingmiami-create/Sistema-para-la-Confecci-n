-- Acceso por rol: helpers y RLS. El menú no es el único candado.

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('desarrollador', 'admin', 'supervisor');
$$;

create or replace function public.is_office()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() or public.current_app_role() = 'contador';
$$;

create or replace function public.linked_operator_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.operators o
  where o.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.owns_production_header(header uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_production_headers h
    where h.id = header
      and h.operator_id = public.linked_operator_id()
  );
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_office() to authenticated;
grant execute on function public.linked_operator_id() to authenticated;
grant execute on function public.owns_production_header(uuid) to authenticated;

-- El contador puede editar fichas de planta, no correo ni rol de acceso.
create or replace function public.operators_apply_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  found_user uuid;
  found_email text;
begin
  if not public.is_staff() then
    if tg_op = 'INSERT' then
      new.email := null;
      new.access_role := 'operario';
      new.user_id := null;
    else
      new.email := old.email;
      new.access_role := old.access_role;
      new.user_id := old.user_id;
    end if;
  end if;

  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');

  if new.email is null then
    new.user_id := null;
    return new;
  end if;

  if public.is_developer_email(new.email) then
    raise exception 'No se puede vincular la cuenta desarrollador a un operario'
      using errcode = 'P0001';
  end if;

  select u.id, u.email
    into found_user, found_email
  from auth.users u
  where lower(u.email) = new.email
  limit 1;

  if found_user is not null and public.is_developer_email(found_email) then
    raise exception 'No se puede vincular la cuenta desarrollador a un operario'
      using errcode = 'P0001';
  end if;

  if found_user is not null
     and exists (
       select 1
       from public.operators o
       where o.user_id = found_user
         and o.id is distinct from new.id
     )
  then
    raise exception 'Ese correo ya está vinculado a otro operario'
      using errcode = '23505';
  end if;

  new.user_id := found_user;
  return new;
end;
$$;

-- operators
drop policy if exists operators_select_authenticated on public.operators;
drop policy if exists operators_insert_authenticated on public.operators;
drop policy if exists operators_update_authenticated on public.operators;
drop policy if exists operators_delete_authenticated on public.operators;

create policy operators_select_office_or_own on public.operators
  for select to authenticated
  using ((select public.is_office()) or id = (select public.linked_operator_id()));
create policy operators_insert_office on public.operators
  for insert to authenticated
  with check ((select public.is_office()));
create policy operators_update_office on public.operators
  for update to authenticated
  using ((select public.is_office()))
  with check ((select public.is_office()));
create policy operators_delete_office on public.operators
  for delete to authenticated
  using ((select public.is_office()));

-- catálogo de piso: lectura para captura; escritura solo staff
drop policy if exists garment_references_select_authenticated on public.garment_references;
drop policy if exists garment_references_insert_authenticated on public.garment_references;
drop policy if exists garment_references_update_authenticated on public.garment_references;
drop policy if exists garment_references_delete_authenticated on public.garment_references;
create policy garment_references_select_authenticated on public.garment_references
  for select to authenticated using (true);
create policy garment_references_insert_staff on public.garment_references
  for insert to authenticated with check ((select public.is_staff()));
create policy garment_references_update_staff on public.garment_references
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy garment_references_delete_staff on public.garment_references
  for delete to authenticated using ((select public.is_staff()));

drop policy if exists reference_operations_select_authenticated on public.reference_operations;
drop policy if exists reference_operations_insert_authenticated on public.reference_operations;
drop policy if exists reference_operations_update_authenticated on public.reference_operations;
drop policy if exists reference_operations_delete_authenticated on public.reference_operations;
create policy reference_operations_select_authenticated on public.reference_operations
  for select to authenticated using (true);
create policy reference_operations_insert_staff on public.reference_operations
  for insert to authenticated with check ((select public.is_staff()));
create policy reference_operations_update_staff on public.reference_operations
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy reference_operations_delete_staff on public.reference_operations
  for delete to authenticated using ((select public.is_staff()));

drop policy if exists production_orders_select_authenticated on public.production_orders;
drop policy if exists production_orders_insert_authenticated on public.production_orders;
drop policy if exists production_orders_update_authenticated on public.production_orders;
drop policy if exists production_orders_delete_authenticated on public.production_orders;
create policy production_orders_select_authenticated on public.production_orders
  for select to authenticated using (true);
create policy production_orders_insert_staff on public.production_orders
  for insert to authenticated with check ((select public.is_staff()));
create policy production_orders_update_staff on public.production_orders
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy production_orders_delete_staff on public.production_orders
  for delete to authenticated using ((select public.is_staff()));

-- captura: oficina lee todo; operario solo la suya; escribir staff o dueño
drop policy if exists daily_production_headers_select_authenticated on public.daily_production_headers;
drop policy if exists daily_production_headers_insert_authenticated on public.daily_production_headers;
drop policy if exists daily_production_headers_update_authenticated on public.daily_production_headers;
drop policy if exists daily_production_headers_delete_authenticated on public.daily_production_headers;
create policy daily_production_headers_select_office_or_own on public.daily_production_headers
  for select to authenticated
  using ((select public.is_office()) or operator_id = (select public.linked_operator_id()));
create policy daily_production_headers_insert_staff_or_own on public.daily_production_headers
  for insert to authenticated
  with check ((select public.is_staff()) or operator_id = (select public.linked_operator_id()));
create policy daily_production_headers_update_staff_or_own on public.daily_production_headers
  for update to authenticated
  using ((select public.is_staff()) or operator_id = (select public.linked_operator_id()))
  with check ((select public.is_staff()) or operator_id = (select public.linked_operator_id()));
create policy daily_production_headers_delete_staff_or_own on public.daily_production_headers
  for delete to authenticated
  using ((select public.is_staff()) or operator_id = (select public.linked_operator_id()));

drop policy if exists daily_production_entries_select_authenticated on public.daily_production_entries;
drop policy if exists daily_production_entries_insert_authenticated on public.daily_production_entries;
drop policy if exists daily_production_entries_update_authenticated on public.daily_production_entries;
drop policy if exists daily_production_entries_delete_authenticated on public.daily_production_entries;
create policy daily_production_entries_select_office_or_own on public.daily_production_entries
  for select to authenticated
  using ((select public.is_office()) or (select public.owns_production_header(header_id)));
create policy daily_production_entries_insert_staff_or_own on public.daily_production_entries
  for insert to authenticated
  with check ((select public.is_staff()) or (select public.owns_production_header(header_id)));
create policy daily_production_entries_update_staff_or_own on public.daily_production_entries
  for update to authenticated
  using ((select public.is_staff()) or (select public.owns_production_header(header_id)))
  with check ((select public.is_staff()) or (select public.owns_production_header(header_id)));
create policy daily_production_entries_delete_staff_or_own on public.daily_production_entries
  for delete to authenticated
  using ((select public.is_staff()) or (select public.owns_production_header(header_id)));

-- oficina: clientes, costos, calendario
drop policy if exists clients_select_authenticated on public.clients;
drop policy if exists clients_insert_authenticated on public.clients;
drop policy if exists clients_update_authenticated on public.clients;
drop policy if exists clients_delete_authenticated on public.clients;
create policy clients_select_office on public.clients
  for select to authenticated using ((select public.is_office()));
create policy clients_insert_office on public.clients
  for insert to authenticated with check ((select public.is_office()));
create policy clients_update_office on public.clients
  for update to authenticated using ((select public.is_office())) with check ((select public.is_office()));
create policy clients_delete_office on public.clients
  for delete to authenticated using ((select public.is_office()));

drop policy if exists cost_entries_select_authenticated on public.cost_entries;
drop policy if exists cost_entries_insert_authenticated on public.cost_entries;
drop policy if exists cost_entries_update_authenticated on public.cost_entries;
drop policy if exists cost_entries_delete_authenticated on public.cost_entries;
create policy cost_entries_select_office on public.cost_entries
  for select to authenticated using ((select public.is_office()));
create policy cost_entries_insert_office on public.cost_entries
  for insert to authenticated with check ((select public.is_office()));
create policy cost_entries_update_office on public.cost_entries
  for update to authenticated using ((select public.is_office())) with check ((select public.is_office()));
create policy cost_entries_delete_office on public.cost_entries
  for delete to authenticated using ((select public.is_office()));

drop policy if exists cost_categories_select_authenticated on public.cost_categories;
drop policy if exists cost_categories_insert_authenticated on public.cost_categories;
drop policy if exists cost_categories_update_authenticated on public.cost_categories;
drop policy if exists cost_categories_delete_authenticated on public.cost_categories;
create policy cost_categories_select_office on public.cost_categories
  for select to authenticated using ((select public.is_office()));
create policy cost_categories_insert_office on public.cost_categories
  for insert to authenticated with check ((select public.is_office()));
create policy cost_categories_update_office on public.cost_categories
  for update to authenticated using ((select public.is_office())) with check ((select public.is_office()));
create policy cost_categories_delete_office on public.cost_categories
  for delete to authenticated using ((select public.is_office()));

drop policy if exists workshop_calendar_select_authenticated on public.workshop_calendar;
drop policy if exists workshop_calendar_insert_authenticated on public.workshop_calendar;
drop policy if exists workshop_calendar_update_authenticated on public.workshop_calendar;
drop policy if exists workshop_calendar_delete_authenticated on public.workshop_calendar;
create policy workshop_calendar_select_office on public.workshop_calendar
  for select to authenticated using ((select public.is_office()));
create policy workshop_calendar_insert_office on public.workshop_calendar
  for insert to authenticated with check ((select public.is_office()));
create policy workshop_calendar_update_office on public.workshop_calendar
  for update to authenticated using ((select public.is_office())) with check ((select public.is_office()));
create policy workshop_calendar_delete_office on public.workshop_calendar
  for delete to authenticated using ((select public.is_office()));
