-- Route accepted requests, friend posts, and post tags into the notification
-- center. Tags are visible only on posts the viewer can already read.

alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type in ('friend_request', 'friend_request_accepted', 'message', 'friend_post', 'like', 'comment', 'repost', 'tag'));

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_tags_user_created_idx on public.post_tags (user_id, created_at desc);
alter table public.post_tags enable row level security;
revoke all on public.post_tags from anon, authenticated;
grant select, insert on public.post_tags to authenticated;

drop policy if exists "Users read tags on visible posts" on public.post_tags;
create policy "Users read tags on visible posts" on public.post_tags
for select to authenticated using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (p.author_id = auth.uid() or exists (
        select 1 from public.friendships f
        where (f.user_low = auth.uid() and f.user_high = p.author_id)
           or (f.user_high = auth.uid() and f.user_low = p.author_id)
      ))
  )
);
drop policy if exists "Authors tag their friends on posts" on public.post_tags;
create policy "Authors tag their friends on posts" on public.post_tags
for insert to authenticated with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  and user_id <> auth.uid()
  and exists (
    select 1 from public.friendships f
    where (f.user_low = auth.uid() and f.user_high = user_id)
       or (f.user_high = auth.uid() and f.user_low = user_id)
  )
);

create or replace function public.notify_accepted_friend_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications(recipient_id, actor_id, event_type, entity_id)
    values (new.sender_id, new.receiver_id, 'friend_request_accepted', new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_accepted_friend_request() from public, anon, authenticated;
drop trigger if exists notify_friend_request_accepted on public.friend_requests;
create trigger notify_friend_request_accepted after update of status on public.friend_requests
for each row execute function public.notify_accepted_friend_request();

create or replace function public.notify_friends_of_new_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id, actor_id, event_type, entity_id)
  select case when f.user_low = new.author_id then f.user_high else f.user_low end,
         new.author_id, 'friend_post', new.id
  from public.friendships f
  where f.user_low = new.author_id or f.user_high = new.author_id;
  return new;
end;
$$;
revoke all on function public.notify_friends_of_new_post() from public, anon, authenticated;
drop trigger if exists notify_friends_of_new_post on public.posts;
create trigger notify_friends_of_new_post after insert on public.posts
for each row execute function public.notify_friends_of_new_post();

create or replace function public.notify_post_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
declare post_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is not null and post_author <> new.user_id then
    insert into public.notifications(recipient_id, actor_id, event_type, entity_id)
    values (new.user_id, post_author, 'tag', new.post_id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_post_tag() from public, anon, authenticated;
drop trigger if exists notify_tagged_user on public.post_tags;
create trigger notify_tagged_user after insert on public.post_tags
for each row execute function public.notify_post_tag();

do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['notifications', 'messages', 'friend_requests'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
