-- Identidad de acceso: correo y rol en la ficha del operario.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('desarrollador', 'admin', 'supervisor', 'operario', 'consulta', 'contador'));

alter table public.operators
  add column if not exists email text,
  add column if not exists access_role text not null default 'operario',
  add column if not exists user_id uuid;

alter table public.operators drop constraint if exists operators_access_role_check;
alter table public.operators
  add constraint operators_access_role_check
  check (access_role in ('admin', 'contador', 'operario'));

alter table public.operators drop constraint if exists operators_user_id_fkey;
alter table public.operators
  add constraint operators_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create unique index if not exists operators_email_unique
  on public.operators (email)
  where email is not null;

create unique index if not exists operators_user_id_unique
  on public.operators (user_id)
  where user_id is not null;

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

create or replace function public.operators_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.profiles
    set role = new.access_role
    where id = new.user_id
      and role is distinct from 'desarrollador';
  end if;
  return new;
end;
$$;

drop trigger if exists operators_apply_identity on public.operators;
create trigger operators_apply_identity
  before insert or update of email, access_role, user_id
  on public.operators
  for each row execute function public.operators_apply_identity();

drop trigger if exists operators_sync_profile on public.operators;
create trigger operators_sync_profile
  after insert or update of email, access_role, user_id
  on public.operators
  for each row execute function public.operators_sync_profile();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  assigned_role text;
  display_name text;
  matched_operator_id uuid;
  matched_role text;
begin
  display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');

  if public.is_developer_email(new.email) then
    assigned_role := 'desarrollador';
  else
    select o.id, o.access_role
      into matched_operator_id, matched_role
    from public.operators o
    where o.email = lower(trim(coalesce(new.email, '')))
    limit 1;

    if matched_operator_id is not null then
      assigned_role := matched_role;
    else
      assigned_role := public.assign_signup_role(new.email);
    end if;
  end if;

  insert into public.profiles (id, full_name, role)
  values (new.id, display_name, assigned_role)
  on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      role = case
        when public.is_developer_email(new.email) then 'desarrollador'
        when matched_operator_id is not null then assigned_role
        else public.profiles.role
      end;

  if matched_operator_id is not null then
    update public.operators
    set user_id = new.id
    where id = matched_operator_id;
  end if;

  return new;
end;
$$;
