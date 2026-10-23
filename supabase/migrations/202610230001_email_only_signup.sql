-- The app requires confirmed email only. Mobile numbers are collected as
-- profile contact data and are not sent to Supabase Auth or verified by SMS.

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

-- Stop copying Supabase Auth's phone field over the profile contact number.
drop trigger if exists sync_verified_phone_to_profile on auth.users;
revoke all on function public.sync_verified_phone_to_profile() from public, anon, authenticated;

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

-- Create profiles for existing email-confirmed accounts that were waiting on
-- an SMS confirmation before the app began creating their profile.
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

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
notify pgrst, 'reload schema';
