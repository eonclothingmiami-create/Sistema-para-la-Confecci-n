-- Rol desarrollador (acceso máximo, cuenta de pruebas) y alta de usuarios del taller.

create or replace function public.is_developer_email(email text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(email, ''))) = 'davidkaseo@hotmail.com';
$$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('desarrollador', 'admin', 'supervisor', 'operario', 'consulta'));

create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('desarrollador', 'admin')
  );
$$;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
  display_name text;
begin
  assigned_role := public.assign_signup_role(new.email);
  display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');

  insert into public.profiles (id, full_name, role)
  values (new.id, display_name, assigned_role)
  on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      role = case
        when public.is_developer_email(new.email) then 'desarrollador'
        else public.profiles.role
      end;

  return new;
end;
$$;

create or replace function public.protect_profile_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email text;
  actor_email text;
  actor_role text;
begin
  select email into owner_email from auth.users where id = new.id;

  if tg_op = 'INSERT' then
    new.role := public.assign_signup_role(owner_email);
    return new;
  end if;

  if public.is_developer_email(owner_email) then
    new.role := 'desarrollador';
    return new;
  end if;

  if new.role is distinct from old.role then
    if old.role = 'desarrollador' then
      new.role := 'desarrollador';
      return new;
    end if;

    select u.email, p.role
      into actor_email, actor_role
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = auth.uid();

    if public.is_developer_email(actor_email) or actor_role in ('desarrollador', 'admin') then
      return new;
    end if;

    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_roles on public.profiles;
create trigger protect_profile_roles
  before insert or update on public.profiles
  for each row execute function public.protect_profile_roles();

create or replace function public.ensure_own_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  u_email text;
  u_name text;
  assigned_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select
    email,
    nullif(trim(coalesce(raw_user_meta_data->>'full_name', '')), '')
  into u_email, u_name
  from auth.users
  where id = auth.uid();

  select * into result from public.profiles where id = auth.uid();

  if found then
    if public.is_developer_email(u_email) and result.role is distinct from 'desarrollador' then
      update public.profiles
      set role = 'desarrollador'
      where id = auth.uid()
      returning * into result;
    elsif result.full_name is null and u_name is not null then
      update public.profiles
      set full_name = u_name
      where id = auth.uid()
      returning * into result;
    end if;
    return result;
  end if;

  assigned_role := public.assign_signup_role(u_email);

  insert into public.profiles (id, full_name, role)
  values (auth.uid(), u_name, assigned_role)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.is_developer_email(text) to authenticated;
grant execute on function public.has_full_access() to authenticated;
grant execute on function public.assign_signup_role(text) to authenticated;
grant execute on function public.ensure_own_profile() to authenticated;

drop policy if exists profiles_insert_authenticated on public.profiles;
drop policy if exists profiles_update_authenticated on public.profiles;
drop policy if exists profiles_delete_authenticated on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own_or_full on public.profiles;

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own_or_full on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_full_access())
  with check (id = auth.uid() or public.has_full_access());

update public.profiles p
set role = 'desarrollador'
from auth.users u
where p.id = u.id
  and public.is_developer_email(u.email);
