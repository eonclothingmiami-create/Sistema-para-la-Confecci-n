-- Controles de proveedor (aditiva). Requiere fase 1 (tablas + is_vendor_admin).
-- Aplicar MANUALMENTE por SQL Editor después de 20261018010000_subscription_schema.sql.
-- NO usar `supabase db push` hasta alinear el historial con migration repair.

create or replace function public.set_enforcement(p_enabled boolean)
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede cambiar el enforcement'
      using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'p_enabled es obligatorio' using errcode = '22023';
  end if;

  update public.subscription
  set
    enforcement_enabled = p_enabled,
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  returning * into rec;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  return rec;
end;
$$;

revoke all on function public.set_enforcement(boolean) from public;
revoke all on function public.set_enforcement(boolean) from anon;
grant execute on function public.set_enforcement(boolean) to authenticated;

create or replace function public.suspend_subscription()
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede suspender la suscripción'
      using errcode = '42501';
  end if;

  update public.subscription
  set
    status = 'suspended',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  returning * into rec;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  return rec;
end;
$$;

revoke all on function public.suspend_subscription() from public;
revoke all on function public.suspend_subscription() from anon;
grant execute on function public.suspend_subscription() to authenticated;

create or replace function public.reactivate_subscription()
returns public.subscription
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.subscription%rowtype;
begin
  if not (select public.is_vendor_admin()) then
    raise exception 'Solo el administrador del proveedor puede reactivar la suscripción'
      using errcode = '42501';
  end if;

  update public.subscription
  set
    status = 'active',
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = '00000000-0000-4000-8000-000000000001'::uuid
  returning * into rec;

  if not found then
    raise exception 'No existe fila de suscripción' using errcode = 'P0002';
  end if;

  return rec;
end;
$$;

revoke all on function public.reactivate_subscription() from public;
revoke all on function public.reactivate_subscription() from anon;
grant execute on function public.reactivate_subscription() to authenticated;
