import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { getAvatarUrl } from "./avatars";
import { socialErrorMessage } from "./socialErrors";
import EnlargeableImage from "./EnlargeableImage";

const initials = (person) => `${person.firstname?.[0] ?? ""}${person.lastname?.[0] ?? ""}`.toUpperCase() || "U";

const MessagesPage = () => {
  const { userId: selectedId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [incomingNotice, setIncomingNotice] = useState("");
  const [incomingSenderId, setIncomingSenderId] = useState("");

  const loadConversation = useCallback(async (currentUserId, friendId) => {
    const { data, error: messageError } = await supabase.from("messages")
      .select("id, sender_id, recipient_id, body, created_at")
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${currentUserId})`)
      .order("created_at", { ascending: true })
      .limit(200);
    if (messageError) setError(socialErrorMessage(messageError));
    else setMessages(data ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError(authError?.message ?? "Please sign in again.");
      setLoading(false);
      return;
    }
    const currentUser = authData.user;
    setUser(currentUser);
    const { data: relationshipRows, error: relationshipError } = await supabase.from("friendships")
      .select("user_low, user_high")
      .or(`user_low.eq.${currentUser.id},user_high.eq.${currentUser.id}`);
    if (relationshipError) setError(relationshipError.message);
    const friendIds = (relationshipRows ?? []).map((row) => row.user_low === currentUser.id ? row.user_high : row.user_low);
    let friendProfiles = [];
    if (friendIds.length) {
      const { data, error: profileError } = await supabase.from("social_profiles")
        .select("id, username, firstname, lastname, propic, headline")
        .in("id", friendIds);
      if (profileError) setError(profileError.message);
      friendProfiles = data ?? [];
    }
    setFriends(friendProfiles);

    if (!selectedId) {
      setMessages([]);
      setSelectedFriend(null);
      if (friendProfiles.length) navigate(`/messages/${friendProfiles[0].id}`, { replace: true });
      else setLoading(false);
      return;
    }

    const selected = friendProfiles.find((friend) => friend.id === selectedId);
    if (!selected) {
      setSelectedFriend(null);
      setMessages([]);
      setError("You can message someone after they accept your connection request.");
      setLoading(false);
      return;
    }
    setSelectedFriend(selected);
    await loadConversation(currentUser.id, selected.id);
    setLoading(false);
  }, [loadConversation, navigate, selectedId]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  useEffect(() => {
    if (!user?.id || !selectedId) return undefined;
    const channel = supabase.channel(`incoming-messages-${user.id}-${selectedId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const sender = friends.find((friend) => friend.id === payload.new?.sender_id);
        if (!sender) return;
        setIncomingSenderId(sender.id);
        setIncomingNotice(`New message from ${sender.firstname} ${sender.lastname}`);
        window.setTimeout(() => { setIncomingNotice(""); setIncomingSenderId(""); }, 6000);
        if (payload.new?.sender_id === selectedId) void loadConversation(user.id, selectedId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [friends, loadConversation, selectedId, user?.id]);

  const send = async (event) => {
    event.preventDefault();
    if (!body.trim() || !user || !selectedFriend) return;
    setSending(true);
    setError("");
    const { error: sendError } = await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: selectedFriend.id,
      body: body.trim(),
    });
    setSending(false);
    if (sendError) { setError(socialErrorMessage(sendError)); return; }
    setBody("");
    await loadConversation(user.id, selectedFriend.id);
  };

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-gray-200 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
          <h1 className="text-lg font-semibold">Messaging</h1>
          <button onClick={refresh} className="text-sm font-medium text-[#0a66c2] hover:underline">Refresh</button>
        </div>
        {friends.length === 0 ? <p className="p-5 text-sm text-gray-500">Connect with people to start messaging.</p> : (
          <div className="flex max-h-72 overflow-x-auto md:block md:max-h-[620px] md:overflow-y-auto">
            {friends.map((friend) => (
              <NavLink key={friend.id} to={`/messages/${friend.id}`} className={({ isActive }) => `flex min-w-52 items-center gap-3 border-b border-gray-100 p-3 hover:bg-gray-50 md:min-w-0 ${isActive ? "bg-blue-50" : ""}`}>
                {friend.propic ? <EnlargeableImage src={getAvatarUrl(friend.propic)} alt={`${friend.firstname} ${friend.lastname} profile picture`} className="h-11 w-11 shrink-0 overflow-hidden rounded-full" imageClassName="h-full w-full rounded-full object-cover" /> : <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{initials(friend)}</div>}
                <div className="min-w-0"><Link to={`/profile/${friend.id}`} className="block truncate text-sm font-semibold hover:text-[#0a66c2] hover:underline">{friend.firstname} {friend.lastname}</Link><p className="truncate text-xs text-gray-500">@{friend.username}</p></div>
              </NavLink>
            ))}
          </div>
        )}
      </aside>

      <section className="flex min-h-[560px] flex-col">
        {selectedFriend ? (
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
            {selectedFriend.propic ? <EnlargeableImage src={getAvatarUrl(selectedFriend.propic)} alt={`${selectedFriend.firstname} ${selectedFriend.lastname} profile picture`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full" imageClassName="h-full w-full rounded-full object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{initials(selectedFriend)}</div>}
            <div><Link to={`/profile/${selectedFriend.id}`} className="font-semibold hover:text-[#0a66c2] hover:underline">{selectedFriend.firstname} {selectedFriend.lastname}</Link><p className="text-xs text-gray-500">{selectedFriend.headline || `@${selectedFriend.username}`}</p></div>
          </div>
        ) : <div className="border-b border-gray-100 px-5 py-4 text-sm font-semibold">Choose a friend</div>}

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {incomingNotice && <div role="status" className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-[#0a66c2] shadow"><span>{incomingNotice}</span><span className="flex shrink-0 items-center gap-3"><button onClick={() => { if (incomingSenderId) navigate(`/messages/${incomingSenderId}`); setIncomingNotice(""); setIncomingSenderId(""); }} className="font-semibold underline">Open</button><button onClick={() => { setIncomingNotice(""); setIncomingSenderId(""); }} aria-label="Dismiss message alert" className="font-bold">×</button></span></div>}
          {loading ? <p className="text-center text-sm text-gray-500">Loading conversation…</p> : messages.length === 0 && selectedFriend ? <p className="py-16 text-center text-sm text-gray-500">This is the start of your conversation.</p> : null}
          {messages.map((message) => {
            const mine = message.sender_id === user?.id;
            return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-[#0a66c2] text-white" : "bg-gray-100 text-gray-800"}`}>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-blue-100" : "text-gray-500"}`}>{new Date(message.created_at).toLocaleString()}</p>
              </div>
            </div>;
          })}
        </div>

        {error && <p role="alert" className="mx-4 mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {selectedFriend && <form onSubmit={send} className="flex items-end gap-2 border-t border-gray-100 p-4">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={2} placeholder="Write a message…" className="min-h-11 flex-1 resize-y rounded-2xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#0a66c2]" />
          <button disabled={sending || !body.trim()} className="rounded-full bg-[#0a66c2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
        </form>}
      </section>
    </div>
  );
};

export default MessagesPage;
