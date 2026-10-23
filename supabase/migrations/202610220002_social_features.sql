-- Social profile fields.
alter table public.profiles
  add column if not exists headline text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists location text not null default '';

-- Searchable public profile projection: deliberately excludes email, mobile,
-- security question, and security answer.
create or replace view public.social_profiles
with (security_barrier = true)
as
select id, username, firstname, lastname, propic, headline, bio, location
from public.profiles;

grant select on public.social_profiles to authenticated;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_no_self check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_one_pending_pair
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index if not exists friend_requests_receiver_status_idx
  on public.friend_requests (receiver_id, status, created_at desc);

create table if not exists public.friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendships_canonical_order check (user_low < user_high)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  constraint messages_no_self check (sender_id <> recipient_id)
);
create index if not exists messages_conversation_created_idx
  on public.messages (sender_id, recipient_id, created_at);
create index if not exists messages_recipient_created_idx
  on public.messages (recipient_id, created_at);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.messages enable row level security;

revoke all on public.friend_requests, public.friendships, public.posts, public.messages
  from anon, authenticated;
grant select, insert on public.friend_requests to authenticated;
grant select on public.friendships to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "participants read friend requests" on public.friend_requests;
create policy "participants read friend requests"
  on public.friend_requests for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "users send their own pending requests" on public.friend_requests;
create policy "users send their own pending requests"
  on public.friend_requests for insert to authenticated
  with check (auth.uid() = sender_id and auth.uid() <> receiver_id and status = 'pending');

drop policy if exists "users read their friendships" on public.friendships;
create policy "users read their friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = user_low or auth.uid() = user_high);

drop policy if exists "authors read own and friends posts" on public.posts;
create policy "authors read own and friends posts"
  on public.posts for select to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where (f.user_low = auth.uid() and f.user_high = author_id)
         or (f.user_high = auth.uid() and f.user_low = author_id)
    )
  );

drop policy if exists "users publish their own posts" on public.posts;
create policy "users publish their own posts"
  on public.posts for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "authors edit their own posts" on public.posts;
create policy "authors edit their own posts"
  on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "authors delete their own posts" on public.posts;
create policy "authors delete their own posts"
  on public.posts for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "friends read conversation messages" on public.messages;
create policy "friends read conversation messages"
  on public.messages for select to authenticated
  using (
    (sender_id = auth.uid() or recipient_id = auth.uid())
    and exists (
      select 1 from public.friendships f
      where (f.user_low = auth.uid() and f.user_high = case when sender_id = auth.uid() then recipient_id else sender_id end)
         or (f.user_high = auth.uid() and f.user_low = case when sender_id = auth.uid() then recipient_id else sender_id end)
    )
  );

drop policy if exists "friends send each other messages" on public.messages;
create policy "friends send each other messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.friendships f
      where (f.user_low = auth.uid() and f.user_high = recipient_id)
         or (f.user_high = auth.uid() and f.user_low = recipient_id)
    )
  );

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
      or coalesce(p.headline, '') ilike '%' || trim(search_text) || '%'
    )
  order by p.firstname, p.lastname
  limit 30;
$$;

create or replace function public.update_my_social_profile(
  p_headline text,
  p_bio text,
  p_location text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(coalesce(p_headline, '')) > 160
    or char_length(coalesce(p_bio, '')) > 2000
    or char_length(coalesce(p_location, '')) > 120 then
    raise exception 'Profile text is too long';
  end if;

  update public.profiles
  set headline = coalesce(p_headline, ''),
      bio = coalesce(p_bio, ''),
      location = coalesce(p_location, '')
  where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

create or replace function public.send_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if target_user_id = current_user_id then raise exception 'You cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'User not found';
  end if;
  if exists (
    select 1 from public.friendships
    where user_low = least(current_user_id, target_user_id)
      and user_high = greatest(current_user_id, target_user_id)
  ) then raise exception 'You are already friends'; end if;
  if exists (
    select 1 from public.friend_requests
    where status = 'pending'
      and ((sender_id = current_user_id and receiver_id = target_user_id)
        or (sender_id = target_user_id and receiver_id = current_user_id))
  ) then raise exception 'A request between these users is already pending'; end if;

  insert into public.friend_requests(sender_id, receiver_id)
  values (current_user_id, target_user_id)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.respond_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.friend_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into request_row
  from public.friend_requests
  where id = request_id and receiver_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'Pending request not found'; end if;

  update public.friend_requests
  set status = case when accept_request then 'accepted' else 'rejected' end,
      responded_at = now()
  where id = request_row.id;

  if accept_request then
    insert into public.friendships(user_low, user_high)
    values (least(request_row.sender_id, request_row.receiver_id), greatest(request_row.sender_id, request_row.receiver_id))
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.get_friend_feed()
returns table (
  id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  username text,
  firstname text,
  lastname text,
  propic text,
  headline text
)
language sql
stable
security definer
set search_path = ''
as $$
  select post.id, post.author_id, post.body, post.created_at,
         profile.username, profile.firstname, profile.lastname, profile.propic, profile.headline
  from public.posts post
  join public.profiles profile on profile.id = post.author_id
  where auth.uid() is not null
    and (
      post.author_id = auth.uid()
      or exists (
        select 1 from public.friendships f
        where (f.user_low = auth.uid() and f.user_high = post.author_id)
           or (f.user_high = auth.uid() and f.user_low = post.author_id)
      )
    )
  order by post.created_at desc
  limit 100;
$$;

revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.update_my_social_profile(text, text, text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.get_friend_feed() from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.update_my_social_profile(text, text, text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.get_friend_feed() to authenticated;

notify pgrst, 'reload schema';
