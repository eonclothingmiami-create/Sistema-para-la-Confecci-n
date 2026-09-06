-- Seed ficticio. Seguro de re-ejecutar (upsert por IDs fijos).
-- Ejemplo de eficiencia: 0.17*1115 + 0.28*633 = 366.79 / 510 = 71.92%

insert into public.operators (id, name, code, document, position, line, hire_date, active, notes)
values
  ('11111111-1111-4111-8111-111111111111', 'Ana Pérez', 'OP-01', '1001001001', 'Operaria plana', 'Módulo A', '2024-02-01', true, 'Ejemplo'),
  ('22222222-2222-4222-8222-222222222222', 'Luis Gómez', 'OP-02', '1002002002', 'Operario fileteadora', 'Módulo A', '2023-11-15', true, 'Ejemplo'),
  ('33333333-3333-4333-8333-333333333333', 'Marta Ríos', 'OP-03', '1003003003', 'Operaria collaretera', 'Módulo B', '2025-01-10', true, 'Ejemplo')
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  document = excluded.document,
  position = excluded.position,
  line = excluded.line,
  hire_date = excluded.hire_date,
  active = excluded.active,
  notes = excluded.notes;

insert into public.clients (id, name, minute_rate, active, notes)
values
  ('99999991-9999-4999-8999-999999999991', 'Casa Roma', 80, true, 'Valor minuto de ejemplo'),
  ('99999992-9999-4999-8999-999999999992', 'Andes Wear', 95, true, 'Valor minuto de ejemplo')
on conflict (id) do update set
  name = excluded.name,
  minute_rate = excluded.minute_rate,
  active = excluded.active,
  notes = excluded.notes;

insert into public.garment_references (id, code, name, garment_type, client_id, description, active)
values
  ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'BL-ROMA', 'Blusa Roma', 'Blusa', '99999991-9999-4999-8999-999999999991', 'Ruta operacional de ejemplo', true),
  ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'PN-ANDES', 'Pantalón Andes', 'Pantalón', '99999992-9999-4999-8999-999999999992', 'Segunda referencia de ejemplo', true)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  garment_type = excluded.garment_type,
  client_id = excluded.client_id,
  description = excluded.description,
  active = excluded.active;

insert into public.reference_operations (
  id, reference_id, operation_number, operation_name, machine_type, standard_minutes, sort_order, active
)
values
  ('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1, 'Cerrar hombros', 'Plana', 0.17, 1, true),
  ('bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2, 'Pegar manga', 'Fileteadora', 0.35, 2, true),
  ('bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 3, 'Cerrar costados', 'Fileteadora', 0.28, 3, true),
  ('bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1, 'Cerrar entrepierna', 'Fileteadora', 0.42, 1, true),
  ('bbbbbbb5-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 2, 'Pegar pretina', 'Plana', 0.31, 2, true),
  ('bbbbbbb6-bbbb-4bbb-8bbb-bbbbbbbbbbb6', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 3, 'Hacer ruedo', 'Collareta', 0.22, 3, true)
on conflict (id) do update set
  reference_id = excluded.reference_id,
  operation_number = excluded.operation_number,
  operation_name = excluded.operation_name,
  machine_type = excluded.machine_type,
  standard_minutes = excluded.standard_minutes,
  sort_order = excluded.sort_order,
  active = excluded.active;

insert into public.production_orders (
  id, order_number, reference_id, total_quantity, minute_rate, start_date, estimated_end_date, status, notes
)
values
  ('ccccccc1-cccc-4ccc-8ccc-ccccccccccc1', 'LOTE-1001', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2500, 80, current_date - 3, current_date + 7, 'en_proceso', 'Lote Blusa Roma'),
  ('ccccccc2-cccc-4ccc-8ccc-ccccccccccc2', 'LOTE-1002', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1800, 95, current_date - 1, current_date + 10, 'en_proceso', 'Lote Pantalón Andes')
on conflict (id) do update set
  order_number = excluded.order_number,
  reference_id = excluded.reference_id,
  total_quantity = excluded.total_quantity,
  minute_rate = excluded.minute_rate,
  start_date = excluded.start_date,
  estimated_end_date = excluded.estimated_end_date,
  status = excluded.status,
  notes = excluded.notes;

insert into public.daily_production_headers (
  id, production_date, operator_id, production_order_id, installed_capacity_minutes, start_time, end_time, notes
)
values
  ('ddddddd1-dddd-4ddd-8ddd-ddddddddddd1', current_date, '11111111-1111-4111-8111-111111111111', 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc1', 510, '07:00', '16:00', 'Captura de ejemplo 71.9%'),
  ('ddddddd2-dddd-4ddd-8ddd-ddddddddddd2', current_date, '22222222-2222-4222-8222-222222222222', 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc1', 510, '07:00', '16:00', 'Alta eficiencia'),
  ('ddddddd3-dddd-4ddd-8ddd-ddddddddddd3', current_date, '33333333-3333-4333-8333-333333333333', 'ccccccc2-cccc-4ccc-8ccc-ccccccccccc2', 510, '07:00', '16:00', 'Bajo meta')
on conflict (id) do update set
  production_date = excluded.production_date,
  operator_id = excluded.operator_id,
  production_order_id = excluded.production_order_id,
  installed_capacity_minutes = excluded.installed_capacity_minutes,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  notes = excluded.notes;

insert into public.daily_production_entries (
  id, header_id, reference_operation_id, delivered_units, defective_units, notes
)
values
  ('eeeeeee1-eeee-4eee-8eee-eeeeeeeeeee1', 'ddddddd1-dddd-4ddd-8ddd-ddddddddddd1', 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 1115, 8, 'Cerrar hombros'),
  ('eeeeeee2-eeee-4eee-8eee-eeeeeeeeeee2', 'ddddddd1-dddd-4ddd-8ddd-ddddddddddd1', 'bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 633, 4, 'Cerrar costados'),
  ('eeeeeee3-eeee-4eee-8eee-eeeeeeeeeee3', 'ddddddd2-dddd-4ddd-8ddd-ddddddddddd2', 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 1380, 6, 'Pegar manga'),
  ('eeeeeee4-eeee-4eee-8eee-eeeeeeeeeee4', 'ddddddd3-dddd-4ddd-8ddd-ddddddddddd3', 'bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 410, 12, 'Entrepierna'),
  ('eeeeeee5-eeee-4eee-8eee-eeeeeeeeeee5', 'ddddddd3-dddd-4ddd-8ddd-ddddddddddd3', 'bbbbbbb6-bbbb-4bbb-8bbb-bbbbbbbbbbb6', 380, 9, 'Ruedo')
on conflict (id) do update set
  header_id = excluded.header_id,
  reference_operation_id = excluded.reference_operation_id,
  delivered_units = excluded.delivered_units,
  defective_units = excluded.defective_units,
  notes = excluded.notes;
