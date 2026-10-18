-- Fase 3: candado de escritura por suscripción.
-- Solo toca políticas INSERT/UPDATE/DELETE de tablas de negocio.
-- SELECT intacto. subscription / subscription_payments no se tocan aquí.
-- Requiere fase 1 (subscription_is_active con enforcement_enabled).
-- Con enforcement_enabled = false la app sigue en escritura normal (fail-open).
-- Revisar y aplicar MANUALMENTE DESPUÉS de validar fase 1 + frontend.

drop policy if exists operators_insert_office on public.operators;
create policy operators_insert_office on public.operators
  for insert to authenticated
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists operators_update_office on public.operators;
create policy operators_update_office on public.operators
  for update to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()))
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists operators_delete_office on public.operators;
create policy operators_delete_office on public.operators
  for delete to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists garment_references_insert_staff on public.garment_references;
create policy garment_references_insert_staff on public.garment_references
  for insert to authenticated
  with check ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists garment_references_update_staff on public.garment_references;
create policy garment_references_update_staff on public.garment_references
  for update to authenticated
  using ((select public.is_staff()) and (select public.subscription_is_active()))
  with check ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists garment_references_delete_staff on public.garment_references;
create policy garment_references_delete_staff on public.garment_references
  for delete to authenticated
  using ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists reference_operations_insert_staff on public.reference_operations;
create policy reference_operations_insert_staff on public.reference_operations
  for insert to authenticated
  with check ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists reference_operations_update_staff on public.reference_operations;
create policy reference_operations_update_staff on public.reference_operations
  for update to authenticated
  using ((select public.is_staff()) and (select public.subscription_is_active()))
  with check ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists reference_operations_delete_staff on public.reference_operations;
create policy reference_operations_delete_staff on public.reference_operations
  for delete to authenticated
  using ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists production_orders_insert_staff on public.production_orders;
create policy production_orders_insert_staff on public.production_orders
  for insert to authenticated
  with check ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists production_orders_update_staff on public.production_orders;
create policy production_orders_update_staff on public.production_orders
  for update to authenticated
  using ((select public.is_staff()) and (select public.subscription_is_active()))
  with check ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists production_orders_delete_staff on public.production_orders;
create policy production_orders_delete_staff on public.production_orders
  for delete to authenticated
  using ((select public.is_staff()) and (select public.subscription_is_active()));

drop policy if exists daily_production_headers_insert_staff_or_own on public.daily_production_headers;
create policy daily_production_headers_insert_staff_or_own on public.daily_production_headers
  for insert to authenticated
  with check (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or operator_id = (select public.linked_operator_id()))
  );

drop policy if exists daily_production_headers_update_staff_or_own on public.daily_production_headers;
create policy daily_production_headers_update_staff_or_own on public.daily_production_headers
  for update to authenticated
  using (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or operator_id = (select public.linked_operator_id()))
  )
  with check (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or operator_id = (select public.linked_operator_id()))
  );

drop policy if exists daily_production_headers_delete_staff_or_own on public.daily_production_headers;
create policy daily_production_headers_delete_staff_or_own on public.daily_production_headers
  for delete to authenticated
  using (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or operator_id = (select public.linked_operator_id()))
  );

drop policy if exists daily_production_entries_insert_staff_or_own on public.daily_production_entries;
create policy daily_production_entries_insert_staff_or_own on public.daily_production_entries
  for insert to authenticated
  with check (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or (select public.owns_production_header(header_id)))
  );

drop policy if exists daily_production_entries_update_staff_or_own on public.daily_production_entries;
create policy daily_production_entries_update_staff_or_own on public.daily_production_entries
  for update to authenticated
  using (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or (select public.owns_production_header(header_id)))
  )
  with check (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or (select public.owns_production_header(header_id)))
  );

drop policy if exists daily_production_entries_delete_staff_or_own on public.daily_production_entries;
create policy daily_production_entries_delete_staff_or_own on public.daily_production_entries
  for delete to authenticated
  using (
    (select public.subscription_is_active())
    and ((select public.is_staff()) or (select public.owns_production_header(header_id)))
  );

drop policy if exists clients_insert_office on public.clients;
create policy clients_insert_office on public.clients
  for insert to authenticated
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists clients_update_office on public.clients;
create policy clients_update_office on public.clients
  for update to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()))
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists clients_delete_office on public.clients;
create policy clients_delete_office on public.clients
  for delete to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists cost_entries_insert_office on public.cost_entries;
create policy cost_entries_insert_office on public.cost_entries
  for insert to authenticated
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists cost_entries_update_office on public.cost_entries;
create policy cost_entries_update_office on public.cost_entries
  for update to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()))
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists cost_entries_delete_office on public.cost_entries;
create policy cost_entries_delete_office on public.cost_entries
  for delete to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists cost_categories_insert_office on public.cost_categories;
create policy cost_categories_insert_office on public.cost_categories
  for insert to authenticated
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists cost_categories_update_office on public.cost_categories;
create policy cost_categories_update_office on public.cost_categories
  for update to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()))
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists cost_categories_delete_office on public.cost_categories;
create policy cost_categories_delete_office on public.cost_categories
  for delete to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists workshop_calendar_insert_office on public.workshop_calendar;
create policy workshop_calendar_insert_office on public.workshop_calendar
  for insert to authenticated
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists workshop_calendar_update_office on public.workshop_calendar;
create policy workshop_calendar_update_office on public.workshop_calendar
  for update to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()))
  with check ((select public.is_office()) and (select public.subscription_is_active()));

drop policy if exists workshop_calendar_delete_office on public.workshop_calendar;
create policy workshop_calendar_delete_office on public.workshop_calendar
  for delete to authenticated
  using ((select public.is_office()) and (select public.subscription_is_active()));
