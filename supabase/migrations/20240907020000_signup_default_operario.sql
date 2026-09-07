-- Cuentas posteriores al administrador del taller entran como operario.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('desarrollador', 'admin', 'supervisor', 'operario', 'consulta'));

alter table public.profiles alter column role set default 'operario';

create or replace function public.assign_signup_role(user_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_developer_email(user_email) then
    return 'desarrollador';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    return 'admin';
  end if;

  return 'operario';
end;
$$;
