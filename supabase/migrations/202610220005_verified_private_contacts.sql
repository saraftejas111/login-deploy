-- A phone number only becomes the app's mobile contact after Supabase Auth
-- confirms it with an SMS OTP. Authenticated users never read profiles.email/mobile.
-- The original profiles table required a mobile value at signup. Allow NULL so
-- unverified numbers are not stored as trusted contact details.
alter table public.profiles alter column mobile drop not null;

create or replace function public.sync_verified_phone_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is not null and new.phone_confirmed_at is not null then
    update public.profiles set mobile = new.phone where id = new.id;
  else
    update public.profiles set mobile = null where id = new.id;
  end if;
  return new;
end;
$$;

-- Do not trust user metadata for a contact number; only the verified Auth
-- phone value is copied into profiles.mobile by the trigger below.
create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, firstname, lastname, email, username, securityquestion, securityanswer
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'firstname',
    new.raw_user_meta_data ->> 'lastname',
    lower(new.email),
    lower(new.raw_user_meta_data ->> 'username'),
    new.raw_user_meta_data ->> 'securityquestion',
    new.raw_user_meta_data ->> 'securityanswer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists sync_verified_phone_to_profile on auth.users;
create trigger sync_verified_phone_to_profile
after insert or update of phone, phone_confirmed_at on auth.users
for each row execute function public.sync_verified_phone_to_profile();

-- Remove legacy unverified metadata numbers and use verified Auth phone values.
update public.profiles p
set mobile = case when u.phone_confirmed_at is not null then u.phone else null end
from auth.users u
where u.id = p.id;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to service_role;

revoke all on function public.sync_verified_phone_to_profile() from public, anon, authenticated;

notify pgrst, 'reload schema';
