-- Fase 3: candado de escritura por suscripción (políticas RESTRICTIVE nuevas).
-- NO modifica ni reemplaza las políticas existentes de negocio.
-- Con enforcement_enabled = false, subscription_is_active() sigue en true (fail-open).
-- Aplicar MANUALMENTE por SQL Editor. NO usar `supabase db push` hasta alinear
-- el historial remoto con `supabase migration repair`.
-- Idempotente: drop if exists antes de cada create.

begin;

-- operators
drop policy if exists operators_sub_write_insert on public.operators;
create policy operators_sub_write_insert on public.operators
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists operators_sub_write_update on public.operators;
create policy operators_sub_write_update on public.operators
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists operators_sub_write_delete on public.operators;
create policy operators_sub_write_delete on public.operators
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- garment_references
drop policy if exists garment_references_sub_write_insert on public.garment_references;
create policy garment_references_sub_write_insert on public.garment_references
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists garment_references_sub_write_update on public.garment_references;
create policy garment_references_sub_write_update on public.garment_references
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists garment_references_sub_write_delete on public.garment_references;
create policy garment_references_sub_write_delete on public.garment_references
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- reference_operations
drop policy if exists reference_operations_sub_write_insert on public.reference_operations;
create policy reference_operations_sub_write_insert on public.reference_operations
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists reference_operations_sub_write_update on public.reference_operations;
create policy reference_operations_sub_write_update on public.reference_operations
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists reference_operations_sub_write_delete on public.reference_operations;
create policy reference_operations_sub_write_delete on public.reference_operations
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- production_orders
drop policy if exists production_orders_sub_write_insert on public.production_orders;
create policy production_orders_sub_write_insert on public.production_orders
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists production_orders_sub_write_update on public.production_orders;
create policy production_orders_sub_write_update on public.production_orders
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists production_orders_sub_write_delete on public.production_orders;
create policy production_orders_sub_write_delete on public.production_orders
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- daily_production_headers
drop policy if exists daily_production_headers_sub_write_insert on public.daily_production_headers;
create policy daily_production_headers_sub_write_insert on public.daily_production_headers
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists daily_production_headers_sub_write_update on public.daily_production_headers;
create policy daily_production_headers_sub_write_update on public.daily_production_headers
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists daily_production_headers_sub_write_delete on public.daily_production_headers;
create policy daily_production_headers_sub_write_delete on public.daily_production_headers
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- daily_production_entries
drop policy if exists daily_production_entries_sub_write_insert on public.daily_production_entries;
create policy daily_production_entries_sub_write_insert on public.daily_production_entries
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists daily_production_entries_sub_write_update on public.daily_production_entries;
create policy daily_production_entries_sub_write_update on public.daily_production_entries
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists daily_production_entries_sub_write_delete on public.daily_production_entries;
create policy daily_production_entries_sub_write_delete on public.daily_production_entries
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- clients
drop policy if exists clients_sub_write_insert on public.clients;
create policy clients_sub_write_insert on public.clients
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists clients_sub_write_update on public.clients;
create policy clients_sub_write_update on public.clients
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists clients_sub_write_delete on public.clients;
create policy clients_sub_write_delete on public.clients
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- cost_entries
drop policy if exists cost_entries_sub_write_insert on public.cost_entries;
create policy cost_entries_sub_write_insert on public.cost_entries
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists cost_entries_sub_write_update on public.cost_entries;
create policy cost_entries_sub_write_update on public.cost_entries
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists cost_entries_sub_write_delete on public.cost_entries;
create policy cost_entries_sub_write_delete on public.cost_entries
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- cost_categories
drop policy if exists cost_categories_sub_write_insert on public.cost_categories;
create policy cost_categories_sub_write_insert on public.cost_categories
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists cost_categories_sub_write_update on public.cost_categories;
create policy cost_categories_sub_write_update on public.cost_categories
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists cost_categories_sub_write_delete on public.cost_categories;
create policy cost_categories_sub_write_delete on public.cost_categories
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

-- workshop_calendar
drop policy if exists workshop_calendar_sub_write_insert on public.workshop_calendar;
create policy workshop_calendar_sub_write_insert on public.workshop_calendar
  as restrictive for insert to authenticated
  with check ((select public.subscription_is_active()));
drop policy if exists workshop_calendar_sub_write_update on public.workshop_calendar;
create policy workshop_calendar_sub_write_update on public.workshop_calendar
  as restrictive for update to authenticated
  using ((select public.subscription_is_active()))
  with check ((select public.subscription_is_active()));
drop policy if exists workshop_calendar_sub_write_delete on public.workshop_calendar;
create policy workshop_calendar_sub_write_delete on public.workshop_calendar
  as restrictive for delete to authenticated
  using ((select public.subscription_is_active()));

commit;

-- ---------------------------------------------------------------------------
-- Rollback (comentado). Ejecutar solo si necesitas deshacer la fase 3.
-- begin;
-- drop policy if exists operators_sub_write_insert on public.operators;
-- drop policy if exists operators_sub_write_update on public.operators;
-- drop policy if exists operators_sub_write_delete on public.operators;
-- drop policy if exists garment_references_sub_write_insert on public.garment_references;
-- drop policy if exists garment_references_sub_write_update on public.garment_references;
-- drop policy if exists garment_references_sub_write_delete on public.garment_references;
-- drop policy if exists reference_operations_sub_write_insert on public.reference_operations;
-- drop policy if exists reference_operations_sub_write_update on public.reference_operations;
-- drop policy if exists reference_operations_sub_write_delete on public.reference_operations;
-- drop policy if exists production_orders_sub_write_insert on public.production_orders;
-- drop policy if exists production_orders_sub_write_update on public.production_orders;
-- drop policy if exists production_orders_sub_write_delete on public.production_orders;
-- drop policy if exists daily_production_headers_sub_write_insert on public.daily_production_headers;
-- drop policy if exists daily_production_headers_sub_write_update on public.daily_production_headers;
-- drop policy if exists daily_production_headers_sub_write_delete on public.daily_production_headers;
-- drop policy if exists daily_production_entries_sub_write_insert on public.daily_production_entries;
-- drop policy if exists daily_production_entries_sub_write_update on public.daily_production_entries;
-- drop policy if exists daily_production_entries_sub_write_delete on public.daily_production_entries;
-- drop policy if exists clients_sub_write_insert on public.clients;
-- drop policy if exists clients_sub_write_update on public.clients;
-- drop policy if exists clients_sub_write_delete on public.clients;
-- drop policy if exists cost_entries_sub_write_insert on public.cost_entries;
-- drop policy if exists cost_entries_sub_write_update on public.cost_entries;
-- drop policy if exists cost_entries_sub_write_delete on public.cost_entries;
-- drop policy if exists cost_categories_sub_write_insert on public.cost_categories;
-- drop policy if exists cost_categories_sub_write_update on public.cost_categories;
-- drop policy if exists cost_categories_sub_write_delete on public.cost_categories;
-- drop policy if exists workshop_calendar_sub_write_insert on public.workshop_calendar;
-- drop policy if exists workshop_calendar_sub_write_update on public.workshop_calendar;
-- drop policy if exists workshop_calendar_sub_write_delete on public.workshop_calendar;
-- commit;
-- ---------------------------------------------------------------------------
