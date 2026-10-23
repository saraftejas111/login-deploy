-- Run this once in the Supabase SQL Editor. It creates a profile row even
-- when email confirmation is enabled and signUp() returns no browser session.
alter table public.profiles
  add column if not exists securityquestion text,
  add column if not exists securityanswer text;

-- The Edge Function uses the server-only service role to read/update recovery
-- fields. Do not grant these permissions to anon or authenticated browser clients.
grant select, update on table public.profiles to service_role;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    firstname,
    lastname,
    email,
    mobile,
    username,
    securityquestion,
    securityanswer
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'firstname',
    new.raw_user_meta_data ->> 'lastname',
    lower(new.email),
    new.raw_user_meta_data ->> 'mobile',
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
  after insert on auth.users
  for each row execute procedure public.create_profile_for_auth_user();

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

-- Backfill profiles for older Auth accounts so username/mobile sign-in can resolve them.
insert into public.profiles (
  id,
  firstname,
  lastname,
  email,
  mobile,
  username
)
select
  users.id,
  users.raw_user_meta_data ->> 'firstname',
  users.raw_user_meta_data ->> 'lastname',
  lower(users.email),
  users.raw_user_meta_data ->> 'mobile',
  lower(users.raw_user_meta_data ->> 'username')
from auth.users as users
where not exists (
  select 1 from public.profiles as existing where existing.id = users.id
)
on conflict (id) do nothing;

-- If a profile already existed, fill its recovery fields from signup metadata
-- when present. Older signups that never saved these values cannot be restored.
update public.profiles as profile
set securityquestion = coalesce(
      nullif(profile.securityquestion, ''),
      nullif(users.raw_user_meta_data ->> 'securityquestion', '')
    ),
    securityanswer = coalesce(
      nullif(profile.securityanswer, ''),
      nullif(users.raw_user_meta_data ->> 'securityanswer', '')
    )
from auth.users as users
where profile.id = users.id
  and (
    nullif(profile.securityquestion, '') is null
    or nullif(profile.securityanswer, '') is null
  )
  and nullif(users.raw_user_meta_data ->> 'securityquestion', '') is not null
  and nullif(users.raw_user_meta_data ->> 'securityanswer', '') is not null;

-- Rate-limit calls to the public account-access Edge Function.
create table if not exists public.account_access_rate_limits (
  key_hash text primary key,
  attempt_count integer not null,
  window_started timestamptz not null
);

revoke all on table public.account_access_rate_limits from public, anon, authenticated;
grant all on table public.account_access_rate_limits to service_role;

create or replace function public.consume_account_access_attempt(
  p_key_hash text,
  p_max_attempts integer default 20,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  delete from public.account_access_rate_limits
  where window_started < now() - interval '1 day';

  insert into public.account_access_rate_limits as existing (key_hash, attempt_count, window_started)
  values (p_key_hash, 1, now())
  on conflict (key_hash) do update
  set attempt_count = case
        when existing.window_started
          <= now() - make_interval(secs => p_window_seconds) then 1
        else existing.attempt_count + 1
      end,
      window_started = case
        when existing.window_started
          <= now() - make_interval(secs => p_window_seconds) then now()
        else existing.window_started
      end
  returning attempt_count into current_count;

  return current_count <= p_max_attempts;
end;
$$;

revoke all on function public.consume_account_access_attempt(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_account_access_attempt(text, integer, integer)
  to service_role;
