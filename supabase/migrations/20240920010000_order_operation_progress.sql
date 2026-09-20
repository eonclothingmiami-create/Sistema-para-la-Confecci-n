-- Avance de cada operación del lote: hecho vs cantidad del lote.

create or replace view public.order_operation_progress
with (security_invoker = true) as
select
  po.id as production_order_id,
  po.order_number,
  po.reference_id,
  po.status,
  po.total_quantity,
  ro.id as reference_operation_id,
  ro.operation_number,
  ro.operation_name,
  ro.sort_order,
  coalesce(agg.delivered_units, 0)::integer as delivered_units,
  greatest(po.total_quantity - coalesce(agg.delivered_units, 0), 0)::integer as remaining_units,
  coalesce(agg.delivered_units, 0) > po.total_quantity as over_delivered
from public.production_orders po
join public.reference_operations ro
  on ro.reference_id = po.reference_id
 and ro.active = true
left join (
  select
    h.production_order_id,
    e.reference_operation_id,
    sum(e.delivered_units) as delivered_units
  from public.daily_production_headers h
  join public.daily_production_entries e on e.header_id = h.id
  group by h.production_order_id, e.reference_operation_id
) agg
  on agg.production_order_id = po.id
 and agg.reference_operation_id = ro.id;

grant select on public.order_operation_progress to authenticated;
