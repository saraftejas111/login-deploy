-- Reactions, comments, reposts, post photos, and in-app notifications.
alter table public.posts add column if not exists image_url text;
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check check (
  char_length(trim(body)) <= 3000
  and (char_length(trim(body)) > 0 or image_url is not null)
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);

create table if not exists public.post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('friend_request', 'message', 'like', 'comment', 'repost')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reposts enable row level security;
alter table public.notifications enable row level security;

revoke all on public.post_likes, public.post_comments, public.post_reposts, public.notifications
  from anon, authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert on public.post_comments to authenticated;
grant select, insert, delete on public.post_reposts to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "Friends view likes on visible posts" on public.post_likes;
create policy "Friends view likes on visible posts" on public.post_likes
for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "Users like visible posts" on public.post_likes;
create policy "Users like visible posts" on public.post_likes
for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "Users remove their likes" on public.post_likes;
create policy "Users remove their likes" on public.post_likes
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Friends read comments on visible posts" on public.post_comments;
create policy "Friends read comments on visible posts" on public.post_comments
for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "Users comment on visible posts" on public.post_comments;
create policy "Users comment on visible posts" on public.post_comments
for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "Friends view reposts on visible posts" on public.post_reposts;
create policy "Friends view reposts on visible posts" on public.post_reposts
for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "Users repost visible posts" on public.post_reposts;
create policy "Users repost visible posts" on public.post_reposts
for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "Users remove their reposts" on public.post_reposts;
create policy "Users remove their reposts" on public.post_reposts
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Users read their notifications" on public.notifications;
create policy "Users read their notifications" on public.notifications
for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "Users mark their notifications read" on public.notifications;
create policy "Users mark their notifications read" on public.notifications
for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace function public.notify_social_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author uuid;
  notify_recipient uuid;
  notify_actor uuid;
  notify_type text;
  notify_entity uuid;
begin
  if tg_table_name = 'friend_requests' then
    notify_recipient := new.receiver_id;
    notify_actor := new.sender_id;
    notify_type := 'friend_request';
    notify_entity := new.id;
  elsif tg_table_name = 'messages' then
    notify_recipient := new.recipient_id;
    notify_actor := new.sender_id;
    notify_type := 'message';
    notify_entity := new.id;
  else
    select p.author_id into target_author from public.posts p where p.id = new.post_id;
    notify_recipient := target_author;
    notify_actor := new.user_id;
    notify_type := case tg_table_name
      when 'post_likes' then 'like'
      when 'post_comments' then 'comment'
      else 'repost'
    end;
    notify_entity := new.post_id;
  end if;

  if notify_recipient is not null and notify_actor is not null and notify_recipient <> notify_actor then
    insert into public.notifications(recipient_id, actor_id, event_type, entity_id)
    values (notify_recipient, notify_actor, notify_type, notify_entity);
  end if;
  return new;
end;
$$;

revoke all on function public.notify_social_event() from public, anon, authenticated;

drop trigger if exists notify_new_friend_request on public.friend_requests;
create trigger notify_new_friend_request after insert on public.friend_requests
for each row when (new.status = 'pending') execute function public.notify_social_event();
drop trigger if exists notify_new_message on public.messages;
create trigger notify_new_message after insert on public.messages
for each row execute function public.notify_social_event();
drop trigger if exists notify_new_post_like on public.post_likes;
create trigger notify_new_post_like after insert on public.post_likes
for each row execute function public.notify_social_event();
drop trigger if exists notify_new_post_comment on public.post_comments;
create trigger notify_new_post_comment after insert on public.post_comments
for each row execute function public.notify_social_event();
drop trigger if exists notify_new_post_repost on public.post_reposts;
create trigger notify_new_post_repost after insert on public.post_reposts
for each row execute function public.notify_social_event();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

drop policy if exists "Users upload their own post media" on storage.objects;
create policy "Users upload their own post media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users update their own post media" on storage.objects;
create policy "Users update their own post media" on storage.objects
for update to authenticated using (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Friends read media from visible posts" on storage.objects;
create policy "Friends read media from visible posts" on storage.objects
for select to authenticated using (
  bucket_id = 'post-media'
  and exists (
    select 1 from public.posts p
    where p.image_url = 'storage:post-media/' || storage.objects.name
  )
);

drop function if exists public.get_friend_feed();
create function public.get_friend_feed()
returns table (
  id uuid,
  author_id uuid,
  body text,
  image_url text,
  created_at timestamptz,
  username text,
  firstname text,
  lastname text,
  propic text,
  headline text,
  reposted_by uuid,
  reposted_by_firstname text,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  reposted_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with feed_items as (
    select p.id, p.author_id, p.body, p.image_url, p.created_at, null::uuid as reposted_by
    from public.posts p
    where auth.uid() is not null and (
      p.author_id = auth.uid() or exists (
        select 1 from public.friendships f
        where (f.user_low = auth.uid() and f.user_high = p.author_id)
           or (f.user_high = auth.uid() and f.user_low = p.author_id)
      )
    )
    union all
    select p.id, p.author_id, p.body, p.image_url, r.created_at, r.user_id
    from public.post_reposts r join public.posts p on p.id = r.post_id
    where auth.uid() is not null and (
      r.user_id = auth.uid() or exists (
        select 1 from public.friendships f
        where (f.user_low = auth.uid() and f.user_high = r.user_id)
           or (f.user_high = auth.uid() and f.user_low = r.user_id)
      )
    )
  )
  select f.id, f.author_id, f.body, f.image_url, f.created_at,
         p.username, p.firstname, p.lastname, p.propic, p.headline,
         f.reposted_by, rp.firstname,
         (select count(*) from public.post_likes l where l.post_id = f.id),
         (select count(*) from public.post_comments c where c.post_id = f.id),
         exists (select 1 from public.post_likes l where l.post_id = f.id and l.user_id = auth.uid()),
         exists (select 1 from public.post_reposts r where r.post_id = f.id and r.user_id = auth.uid())
  from feed_items f
  join public.profiles p on p.id = f.author_id
  left join public.profiles rp on rp.id = f.reposted_by
  order by f.created_at desc
  limit 100;
$$;

revoke all on function public.get_friend_feed() from public, anon;
grant execute on function public.get_friend_feed() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';
