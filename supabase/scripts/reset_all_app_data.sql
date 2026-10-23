-- DESTRUCTIVE: permanently removes every account and app record from this
-- Supabase project. Run in the Supabase SQL Editor only if you intend to reset
-- the whole app. This does not delete uploaded Storage files; remove files from
-- the avatars and post-media buckets separately in Supabase Storage.
begin;

delete from public.post_likes;
delete from public.post_comments;
delete from public.post_reposts;
delete from public.notifications;
delete from public.messages;
delete from public.friend_requests;
delete from public.friendships;
delete from public.posts;
delete from public.account_access_rate_limits;
delete from public.profiles;
delete from auth.users;

commit;
