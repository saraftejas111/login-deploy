-- Accept only Indian mobile numbers in E.164 form: +91 followed by a
-- 10-digit number whose first digit is 6, 7, 8, or 9. A null phone remains
-- allowed at initial email signup; assigning the phone is validated below.
create or replace function public.validate_indian_auth_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is not null and new.phone !~ '^[+]91[6-9][0-9]{9}$' then
    raise exception 'Enter an Indian mobile number as +91 followed by 10 digits starting with 6-9.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_indian_auth_phone() from public, anon, authenticated;

drop trigger if exists validate_indian_phone_on_auth_insert on auth.users;
create trigger validate_indian_phone_on_auth_insert
before insert on auth.users
for each row execute function public.validate_indian_auth_phone();

drop trigger if exists validate_indian_phone_on_auth_phone_update on auth.users;
create trigger validate_indian_phone_on_auth_phone_update
before update of phone on auth.users
for each row execute function public.validate_indian_auth_phone();

notify pgrst, 'reload schema';
