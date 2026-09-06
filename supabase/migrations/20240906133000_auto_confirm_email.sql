-- Taller interno: confirmar email al crear cuenta para no depender de SMTP.
create or replace function public.auto_confirm_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists auto_confirm_auth_user on auth.users;
create trigger auto_confirm_auth_user
  before insert on auth.users
  for each row execute function public.auto_confirm_auth_user();
