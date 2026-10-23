-- Keep incomplete email/SMS signups out of the app's profile table. Supabase
-- Auth may hold a pending account while codes are being verified, but the app
-- profile is created only after both contact methods are confirmed.
create or replace function public.is_fully_verified_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and u.phone_confirmed_at is not null
  );
$$;

revoke all on function public.is_fully_verified_app_user() from public, anon;
grant execute on function public.is_fully_verified_app_user() to authenticated;

-- A pending Supabase Auth session must not be able to browse the app's public
-- profile projection or use its profile search RPC.
create or replace view public.social_profiles
with (security_barrier = true)
as
select id, username, firstname, lastname, propic, headline, bio, location
from public.profiles
where public.is_fully_verified_app_user();
grant select on public.social_profiles to authenticated;

create or replace function public.search_profiles(search_text text)
returns table (
  id uuid,
  username text,
  firstname text,
  lastname text,
  propic text,
  headline text,
  bio text,
  location text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.firstname, p.lastname, p.propic, p.headline, p.bio, p.location
  from public.profiles p
  where public.is_fully_verified_app_user()
    and p.id <> auth.uid()
    and nullif(trim(search_text), '') is not null
    and (
      coalesce(p.username, '') ilike '%' || trim(search_text) || '%'
      or coalesce(p.firstname, '') ilike '%' || trim(search_text) || '%'
      or coalesce(p.lastname, '') ilike '%' || trim(search_text) || '%'
      or coalesce(p.email, '') ilike '%' || trim(search_text) || '%'
      or concat_ws(' ', p.firstname, p.lastname) ilike '%' || trim(search_text) || '%'
      or coalesce(p.headline, '') ilike '%' || trim(search_text) || '%'
    )
  order by p.firstname, p.lastname
  limit 30;
$$;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null or new.phone_confirmed_at is null then
    return new;
  end if;

  insert into public.profiles (
    id, firstname, lastname, email, mobile, username, securityquestion, securityanswer
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'firstname',
    new.raw_user_meta_data ->> 'lastname',
    lower(new.email),
    new.phone,
    lower(new.raw_user_meta_data ->> 'username'),
    new.raw_user_meta_data ->> 'securityquestion',
    new.raw_user_meta_data ->> 'securityanswer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update of email_confirmed_at, phone_confirmed_at on auth.users
for each row execute function public.create_profile_for_auth_user();

-- Existing accounts that already completed both checks get a profile if they
-- are missing one. Pending accounts remain excluded until their final OTP.
insert into public.profiles (
  id, firstname, lastname, email, mobile, username, securityquestion, securityanswer
)
select
  u.id,
  u.raw_user_meta_data ->> 'firstname',
  u.raw_user_meta_data ->> 'lastname',
  lower(u.email),
  u.phone,
  lower(u.raw_user_meta_data ->> 'username'),
  u.raw_user_meta_data ->> 'securityquestion',
  u.raw_user_meta_data ->> 'securityanswer'
from auth.users u
where u.email_confirmed_at is not null
  and u.phone_confirmed_at is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

create or replace function public.prevent_verified_contact_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.email_confirmed_at is not null
    and (new.email is distinct from old.email or new.email_confirmed_at is null) then
    raise exception 'A verified email address cannot be changed.' using errcode = '22023';
  end if;

  if old.phone_confirmed_at is not null
    and (new.phone is distinct from old.phone or new.phone_confirmed_at is null) then
    raise exception 'A verified mobile number cannot be changed.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_verified_contact_changes() from public, anon, authenticated;
drop trigger if exists prevent_verified_contact_changes on auth.users;
create trigger prevent_verified_contact_changes
before update of email, email_confirmed_at, phone, phone_confirmed_at on auth.users
for each row execute function public.prevent_verified_contact_changes();

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
notify pgrst, 'reload schema';
