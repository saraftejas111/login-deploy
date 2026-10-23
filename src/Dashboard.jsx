import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { getAvatarUrl, getSignedMediaUrl, uploadPostImage } from "./avatars";
import { socialErrorMessage } from "./socialErrors";
import EnlargeableImage from "./EnlargeableImage";

const initials = (first = "", last = "") => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "U";

const Avatar = ({ src, first, last, size = "h-12 w-12" }) => {
  return src
    ? <EnlargeableImage src={getAvatarUrl(src)} alt={`${first} ${last} profile picture`} className={`${size} shrink-0 overflow-hidden rounded-full`} imageClassName="h-full w-full rounded-full object-cover" />
    : <div className={`${size} grid shrink-0 place-items-center rounded-full bg-[#d9eaf8] font-bold text-[#0a66c2]`}>{initials(first, last)}</div>;
};

const Dashboard = () => {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [friends, setFriends] = useState([]);
  const [taggedFriendIds, setTaggedFriendIds] = useState([]);
  const [body, setBody] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [openComments, setOpenComments] = useState({});
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [workingPostId, setWorkingPostId] = useState(null);
  const [error, setError] = useState("");

  const loadFeed = useCallback(async () => {
    setError("");
    const [{ data: authData, error: authError }, { data: feedData, error: feedError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_friend_feed"),
    ]);
    if (authError) setError(authError.message);
    if (feedError) setError(socialErrorMessage(feedError));
    const currentUser = authData?.user;
    setUser(currentUser ?? null);
    const feedItems = feedData ?? [];
    const postIds = [...new Set(feedItems.map((post) => post.id))];
    const [{ data: tagRows, error: tagError }, { data: friendshipRows }] = currentUser ? await Promise.all([
      postIds.length ? supabase.from("post_tags").select("post_id, user_id").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
      supabase.from("friendships").select("user_low, user_high").or(`user_low.eq.${currentUser.id},user_high.eq.${currentUser.id}`),
    ]) : [{ data: [], error: null }, { data: [] }];
    if (tagError) setError(socialErrorMessage(tagError));
    const friendIds = (friendshipRows ?? []).map((row) => row.user_low === currentUser?.id ? row.user_high : row.user_low);
    const { data: friendProfiles, error: friendError } = friendIds.length
      ? await supabase.from("social_profiles").select("id, username, firstname, lastname, propic").in("id", friendIds)
      : { data: [], error: null };
    if (friendError) setError(socialErrorMessage(friendError));
    setFriends(friendProfiles ?? []);
    const tagUserIds = [...new Set((tagRows ?? []).map((tag) => tag.user_id))];
    const { data: tagProfiles } = tagUserIds.length
      ? await supabase.from("social_profiles").select("id, username, firstname, lastname").in("id", tagUserIds)
      : { data: [] };
    const tagById = new Map((tagProfiles ?? []).map((person) => [person.id, person]));
    const tagsByPost = new Map();
    (tagRows ?? []).forEach((tag) => tagsByPost.set(tag.post_id, [...(tagsByPost.get(tag.post_id) ?? []), tagById.get(tag.user_id)].filter(Boolean)));
    const feedWithImages = await Promise.all(feedItems.map(async (post) => {
      try { return { ...post, tagged_people: tagsByPost.get(post.id) ?? [], image_src: await getSignedMediaUrl(post.image_url) }; }
      catch (imageError) { setError(imageError.message); return { ...post, image_src: "" }; }
    }));
    setPosts(feedWithImages);

    if (currentUser) {
      const { data: ownProfile, error: profileError } = await supabase.from("social_profiles")
        .select("id, username, firstname, lastname, propic, headline, bio, location")
        .eq("id", currentUser.id).maybeSingle();
      if (profileError) setError(socialErrorMessage(profileError));
      const metadata = currentUser.user_metadata ?? {};
      setProfile({
        ...ownProfile,
        firstname: ownProfile?.firstname || metadata.firstname || "",
        lastname: ownProfile?.lastname || metadata.lastname || "",
        username: ownProfile?.username || metadata.username || "",
        propic: ownProfile?.propic || metadata.avatar_url || "",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(loadFeed); }, [loadFeed]);

  const publish = async (event) => {
    event.preventDefault();
    if ((!body.trim() && !postImage) || !user) return;
    setPosting(true);
    setError("");
    let imageUrl = null;
    try {
      if (postImage) imageUrl = await uploadPostImage(user.id, postImage);
      const { data: createdPost, error: postError } = await supabase.from("posts").insert({
        author_id: user.id,
        body: body.trim(),
        image_url: imageUrl,
      }).select("id").single();
      if (postError) throw postError;
      if (taggedFriendIds.length) {
        const { error: tagInsertError } = await supabase.from("post_tags").insert(taggedFriendIds.map((friendId) => ({ post_id: createdPost.id, user_id: friendId })));
        if (tagInsertError) throw tagInsertError;
      }
      setBody("");
      setTaggedFriendIds([]);
      setPostImage(null);
      setImagePreview("");
      await loadFeed();
    } catch (postError) {
      setError(socialErrorMessage(postError));
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post) => {
    if (!user) return;
    setWorkingPostId(post.id);
    const result = post.liked_by_me
      ? await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id)
      : await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
    setWorkingPostId(null);
    if (result.error) setError(socialErrorMessage(result.error));
    else await loadFeed();
  };

  const toggleRepost = async (post) => {
    if (!user) return;
    setWorkingPostId(post.id);
    const result = post.reposted_by_me
      ? await supabase.from("post_reposts").delete().eq("post_id", post.id).eq("user_id", user.id)
      : await supabase.from("post_reposts").insert({ post_id: post.id, user_id: user.id });
    setWorkingPostId(null);
    if (result.error) setError(socialErrorMessage(result.error));
    else await loadFeed();
  };

  const loadComments = async (postId) => {
    const { data, error: commentsError } = await supabase.from("post_comments")
      .select("id, user_id, body, created_at").eq("post_id", postId)
      .order("created_at", { ascending: true }).limit(100);
    if (commentsError) { setError(socialErrorMessage(commentsError)); return; }
    const userIds = [...new Set((data ?? []).map((comment) => comment.user_id))];
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from("social_profiles").select("id, firstname, lastname, username, propic").in("id", userIds)
      : { data: [], error: null };
    if (profilesError) { setError(socialErrorMessage(profilesError)); return; }
    const byId = new Map((profiles ?? []).map((person) => [person.id, person]));
    setComments((current) => ({ ...current, [postId]: (data ?? []).map((comment) => ({ ...comment, person: byId.get(comment.user_id) })) }));
  };

  const toggleComments = async (postId) => {
    const opening = !openComments[postId];
    setOpenComments((current) => ({ ...current, [postId]: opening }));
    if (opening) await loadComments(postId);
  };

  const addComment = async (event, postId) => {
    event.preventDefault();
    const commentBody = commentDrafts[postId]?.trim();
    if (!commentBody || !user) return;
    const { error: commentError } = await supabase.from("post_comments").insert({ post_id: postId, user_id: user.id, body: commentBody });
    if (commentError) { setError(socialErrorMessage(commentError)); return; }
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    await loadComments(postId);
    await loadFeed();
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) setError("Choose an image file.");
      else if (file.size > 5 * 1024 * 1024) setError("Choose an image smaller than 5 MB.");
      else { setPostImage(file); setImagePreview(URL.createObjectURL(file)); setError(""); }
    }
    event.target.value = "";
  };

  if (loading) return <div className="py-20 text-center text-gray-500">Loading your network...</div>;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)_270px]">
      <aside className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="h-16 bg-gradient-to-r from-[#0a66c2] to-[#70b5f9]" />
        <div className="px-4 pb-4 text-center">
          <div className="-mt-9 flex justify-center"><Avatar src={profile?.propic} first={profile?.firstname} last={profile?.lastname} size="h-16 w-16 border-2 border-white" /></div>
          <h2 className="mt-2 font-semibold">{profile?.firstname} {profile?.lastname}</h2>
          <p className="mt-1 text-xs text-gray-500">{profile?.headline || "Add a headline to introduce yourself"}</p>
          <NavLink to="/profile" className="mt-4 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">View profile</NavLink>
        </div>
        <div className="border-t border-gray-100 px-4 py-3 text-sm"><NavLink to="/friends" className="text-gray-600 hover:text-[#0a66c2]">My network →</NavLink></div>
      </aside>

      <section className="space-y-4">
        {location.state?.signupNotice && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{location.state.signupNotice} You can upload it from your profile page.</div>}
        <form onSubmit={publish} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex gap-3">
            <Avatar src={profile?.propic} first={profile?.firstname} last={profile?.lastname} />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={3000} rows={3} placeholder="Share an update with your friends..." className="min-h-20 flex-1 resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" />
          </div>
          {friends.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-[#0a66c2]">Tag friends</summary><div className="mt-2 flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md bg-gray-50 p-3">{friends.map((friend) => <label key={friend.id} className="flex items-center gap-2"><input type="checkbox" checked={taggedFriendIds.includes(friend.id)} onChange={(event) => setTaggedFriendIds((current) => event.target.checked ? [...current, friend.id] : current.filter((id) => id !== friend.id))} /><span>{friend.firstname} {friend.lastname}</span></label>)}</div></details>}
          {imagePreview && <div className="mt-3"><img src={imagePreview} alt="Post preview" className="max-h-72 rounded-lg object-contain" /><button type="button" onClick={() => { setPostImage(null); setImagePreview(""); }} className="mt-1 text-sm text-red-600">Remove photo</button></div>}
          <div className="mt-3 flex items-center justify-between">
            <label className="cursor-pointer rounded-full px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Add photo<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={selectImage} /></label>
            <button disabled={posting || (!body.trim() && !postImage)} className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:opacity-50">{posting ? "Posting..." : "Post"}</button>
          </div>
        </form>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {posts.length === 0 && !error && <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center"><div className="text-3xl">🌱</div><h2 className="mt-3 font-semibold">Your feed is ready to grow</h2><p className="mt-1 text-sm text-gray-500">Connect with people to see their updates here.</p><NavLink to="/people" className="mt-4 inline-block rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white">Find people</NavLink></div>}

        {posts.map((post) => (
          <article id={`post-${post.id}`} key={`${post.id}-${post.reposted_by ?? "original"}`} className="rounded-lg border border-gray-200 bg-white p-4">
            {post.reposted_by && <p className="mb-3 text-xs text-gray-500"><Link to={`/profile/${post.reposted_by}`} className="hover:text-[#0a66c2] hover:underline">{post.reposted_by_firstname || "A friend"}</Link> reposted this</p>}
            <div className="flex items-center gap-3"><Avatar src={post.propic} first={post.firstname} last={post.lastname} /><div className="min-w-0"><Link to={`/profile/${post.author_id}`} className="truncate text-sm font-semibold hover:text-[#0a66c2] hover:underline">{post.firstname} {post.lastname}</Link><p className="truncate text-xs text-gray-500">{post.headline || `@${post.username}`} · {new Date(post.created_at).toLocaleString()}</p></div></div>
            {post.body && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{post.body}</p>}
            {post.tagged_people?.length > 0 && <p className="mt-2 text-xs text-gray-500">with {post.tagged_people.map((person, index) => <span key={person.id}>{index > 0 && ", "}<Link to={`/profile/${person.id}`} className="text-[#0a66c2] hover:underline">{person.firstname} {person.lastname}</Link></span>)}</p>}
            {post.image_src && <EnlargeableImage src={post.image_src} alt="Post attachment" className="mt-3 block w-full" imageClassName="max-h-[520px] w-full rounded-lg bg-gray-50 object-contain" />}
            <div className="mt-4 flex justify-between border-y border-gray-100 py-2 text-xs text-gray-500"><span>{post.like_count} likes</span><button onClick={() => toggleComments(post.id)}>{post.comment_count} comments</button></div>
            <div className="grid grid-cols-3 border-b border-gray-100 py-1 text-sm font-semibold text-gray-600">
              <button disabled={workingPostId === post.id} onClick={() => toggleLike(post)} className={`rounded py-2 hover:bg-gray-50 ${post.liked_by_me ? "text-[#0a66c2]" : ""}`}>{post.liked_by_me ? "Liked" : "Like"}</button>
              <button onClick={() => toggleComments(post.id)} className="rounded py-2 hover:bg-gray-50">Comment</button>
              <button disabled={workingPostId === post.id} onClick={() => toggleRepost(post)} className={`rounded py-2 hover:bg-gray-50 ${post.reposted_by_me ? "text-[#0a66c2]" : ""}`}>{post.reposted_by_me ? "Reposted" : "Repost"}</button>
            </div>
            {openComments[post.id] && <div className="space-y-3 pt-3">
              {(comments[post.id] ?? []).map((comment) => <div key={comment.id} className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-xs font-semibold"><Link to={`/profile/${comment.user_id}`} className="hover:text-[#0a66c2] hover:underline">{comment.person?.firstname} {comment.person?.lastname}</Link> <span className="font-normal text-gray-500">@{comment.person?.username}</span></p><p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p></div>)}
              <form onSubmit={(event) => addComment(event, post.id)} className="flex gap-2"><input value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={2000} placeholder="Write a comment..." className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-[#0a66c2]" /><button disabled={!(commentDrafts[post.id] ?? "").trim()} className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Comment</button></form>
            </div>}
          </article>
        ))}
      </section>

      <aside className="hidden rounded-lg border border-gray-200 bg-white p-4 lg:block"><h2 className="font-semibold">Build your network</h2><p className="mt-2 text-sm leading-5 text-gray-500">Find people, send a connection request, and share updates with your friends.</p><NavLink to="/people" className="mt-4 inline-flex rounded-full border border-[#0a66c2] px-4 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-blue-50">Discover people</NavLink></aside>
    </div>
  );
};

export default Dashboard;
