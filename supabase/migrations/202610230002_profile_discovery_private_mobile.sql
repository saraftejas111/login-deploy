-- Keep account data private while allowing email-confirmed members to search
-- by their profile name, username, email, or an exact Indian mobile number.

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
  );
$$;
revoke all on function public.is_fully_verified_app_user() from public, anon;
grant execute on function public.is_fully_verified_app_user() to authenticated;

create or replace view public.social_profiles
with (security_barrier = true)
as
select id, username, firstname, lastname, propic, headline, bio, location
from public.profiles
where public.is_fully_verified_app_user();
grant select on public.social_profiles to authenticated;

drop trigger if exists sync_verified_phone_to_profile on auth.users;
drop function if exists public.sync_verified_phone_to_profile();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mobile_digits text;
  mobile_value text;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  mobile_value := coalesce(new.raw_user_meta_data ->> 'mobile', new.phone);
  mobile_digits := regexp_replace(coalesce(mobile_value, ''), '\D', '', 'g');
  if length(mobile_digits) = 12 and left(mobile_digits, 2) = '91' then
    mobile_value := '+91' || right(mobile_digits, 10);
  elsif length(mobile_digits) = 10 then
    mobile_value := '+91' || mobile_digits;
  else
    mobile_value := null;
  end if;

  if mobile_value is not null and mobile_value !~ '^\+91[6-9][0-9]{9}$' then
    mobile_value := null;
  end if;

  insert into public.profiles (
    id, firstname, lastname, email, mobile, username, securityquestion, securityanswer
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'firstname',
    new.raw_user_meta_data ->> 'lastname',
    lower(new.email),
    mobile_value,
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
after insert or update of email_confirmed_at on auth.users
for each row execute function public.create_profile_for_auth_user();
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

-- Repair missing profile fields for existing email-confirmed accounts without
-- replacing values users have already entered themselves.
update public.profiles p
set firstname = coalesce(nullif(p.firstname, ''), u.raw_user_meta_data ->> 'firstname'),
    lastname = coalesce(nullif(p.lastname, ''), u.raw_user_meta_data ->> 'lastname'),
    username = coalesce(nullif(p.username, ''), lower(u.raw_user_meta_data ->> 'username')),
    email = coalesce(nullif(p.email, ''), lower(u.email)),
    mobile = coalesce(
      nullif(p.mobile, ''),
      case
        when regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g')
          ~ '^91[6-9][0-9]{9}$'
          then '+91' || right(regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g'), 10)
        when regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g')
          ~ '^[6-9][0-9]{9}$'
          then '+91' || regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g')
        else null
      end
    )
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is not null;

insert into public.profiles (
  id, firstname, lastname, email, mobile, username, securityquestion, securityanswer
)
select
  u.id,
  u.raw_user_meta_data ->> 'firstname',
  u.raw_user_meta_data ->> 'lastname',
  lower(u.email),
  case
    when regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g')
      ~ '^91[6-9][0-9]{9}$'
      then '+91' || right(regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g'), 10)
    when regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g')
      ~ '^[6-9][0-9]{9}$'
      then '+91' || regexp_replace(coalesce(u.raw_user_meta_data ->> 'mobile', u.phone, ''), '\D', '', 'g')
    else null
  end,
  lower(u.raw_user_meta_data ->> 'username'),
  u.raw_user_meta_data ->> 'securityquestion',
  u.raw_user_meta_data ->> 'securityanswer'
from auth.users u
where u.email_confirmed_at is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

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
  with input as (
    select trim(search_text) as term,
           regexp_replace(trim(search_text), '\D', '', 'g') as phone_digits
  )
  select p.id, p.username, p.firstname, p.lastname, p.propic, p.headline, p.bio, p.location
  from public.profiles p
  cross join input i
  where public.is_fully_verified_app_user()
    and p.id <> auth.uid()
    and nullif(i.term, '') is not null
    and (
      coalesce(p.username, '') ilike '%' || i.term || '%'
      or coalesce(p.firstname, '') ilike '%' || i.term || '%'
      or coalesce(p.lastname, '') ilike '%' || i.term || '%'
      or coalesce(p.email, '') ilike '%' || i.term || '%'
      or concat_ws(' ', p.firstname, p.lastname) ilike '%' || i.term || '%'
      or coalesce(p.headline, '') ilike '%' || i.term || '%'
      or (
        length(i.phone_digits) = 10
        and right(regexp_replace(coalesce(p.mobile, ''), '\D', '', 'g'), 10) = i.phone_digits
      )
      or (
        length(i.phone_digits) = 12
        and left(i.phone_digits, 2) = '91'
        and regexp_replace(coalesce(p.mobile, ''), '\D', '', 'g') = i.phone_digits
      )
    )
  order by p.firstname, p.lastname
  limit 30;
$$;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- This RPC can return mobile data only for the current authenticated user.
create or replace function public.get_my_private_contact()
returns table (email text, mobile text)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p.email), p.mobile
  from public.profiles p
  where p.id = auth.uid();
$$;
revoke all on function public.get_my_private_contact() from public, anon;
grant execute on function public.get_my_private_contact() to authenticated;

notify pgrst, 'reload schema';
