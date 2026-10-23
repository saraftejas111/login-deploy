-- Search by email without returning the email address in search results.
alter table public.profiles
  add column if not exists headline text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists location text not null default '';

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
  where auth.uid() is not null
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

-- Avatar pictures are intentionally public, while uploads are limited to each
-- signed-in user's own folder: avatars/<auth-user-id>/... .
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

drop policy if exists "Users upload their own avatars" on storage.objects;
create policy "Users upload their own avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update their own avatars" on storage.objects;
create policy "Users update their own avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their own avatars" on storage.objects;
create policy "Users delete their own avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.set_my_avatar_path(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_path is null or (storage.foldername(p_path))[1] <> auth.uid()::text then
    raise exception 'Avatar path must belong to the signed-in user';
  end if;
  if char_length(p_path) > 500 or position('..' in p_path) > 0 then
    raise exception 'Invalid avatar path';
  end if;

  update public.profiles
  set propic = 'storage:avatars/' || p_path
  where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke all on function public.set_my_avatar_path(text) from public, anon;
grant execute on function public.set_my_avatar_path(text) to authenticated;

notify pgrst, 'reload schema';
