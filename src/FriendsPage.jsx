import { useCallback, useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { getAvatarUrl } from "./avatars";
import EnlargeableImage from "./EnlargeableImage";

const avatar = (person) => person.propic
  ? <EnlargeableImage src={getAvatarUrl(person.propic)} alt={`${person.firstname} ${person.lastname} profile picture`} className="h-12 w-12 overflow-hidden rounded-full" imageClassName="h-full w-full rounded-full object-cover" />
  : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{`${person.firstname?.[0] ?? ""}${person.lastname?.[0] ?? ""}`.toUpperCase() || "U"}</div>;

const FriendsPage = () => {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError(authError?.message ?? "Please sign in again.");
      setLoading(false);
      return;
    }
    const id = authData.user.id;
    const [friendResult, requestResult, sentResult] = await Promise.all([
      supabase.from("friendships").select("user_low, user_high, created_at").or(`user_low.eq.${id},user_high.eq.${id}`).order("created_at", { ascending: false }),
      supabase.from("friend_requests").select("id, sender_id, created_at").eq("receiver_id", id).eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("friend_requests").select("id, receiver_id, created_at").eq("sender_id", id).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    const errors = [friendResult.error, requestResult.error, sentResult.error].filter(Boolean);
    if (errors.length) setError(errors.map((item) => item.message).join(" · "));

    const friendIds = (friendResult.data ?? []).map((row) => row.user_low === id ? row.user_high : row.user_low);
    const requestIds = (requestResult.data ?? []).map((row) => row.sender_id);
    const sentIds = (sentResult.data ?? []).map((row) => row.receiver_id);
    const allIds = [...new Set([...friendIds, ...requestIds, ...sentIds])];
    let profiles = [];
    if (allIds.length) {
      const { data, error: peopleError } = await supabase.from("social_profiles")
        .select("id, username, firstname, lastname, propic, headline, location")
        .in("id", allIds);
      if (peopleError) setError(peopleError.message);
      profiles = data ?? [];
    }
    const byId = new Map(profiles.map((person) => [person.id, person]));
    setFriends(friendIds.map((friendId) => byId.get(friendId)).filter(Boolean));
    setRequests((requestResult.data ?? []).map((request) => ({ ...request, person: byId.get(request.sender_id) })).filter((request) => request.person));
    setSentRequests((sentResult.data ?? []).map((request) => ({ ...request, person: byId.get(request.receiver_id) })).filter((request) => request.person));
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = supabase.channel(`friend-requests-${data.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${data.user.id}` }, () => { void load(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `sender_id=eq.${data.user.id}` }, () => { void load(); })
        .subscribe();
    });
    void Promise.resolve().then(load);
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, [load]);

  const respond = async (requestId, accept) => {
    setWorkingId(requestId);
    setError("");
    const { error: responseError } = await supabase.rpc("respond_friend_request", {
      request_id: requestId,
      accept_request: accept,
    });
    setWorkingId(null);
    if (responseError) { setError(responseError.message); return; }
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0a66c2]">My network</p>
        <h1 className="mt-1 text-2xl font-semibold">Connections</h1>
        <p className="mt-2 text-sm text-gray-500">Accept requests to connect. Friends can message each other and see each other’s posts.</p>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="py-10 text-center text-gray-500">Loading network…</p> : (
        <>
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-semibold">Invitations ({requests.length})</h2></div>
            {requests.length === 0 ? <p className="p-5 text-sm text-gray-500">No pending invitations.</p> : (
              <div className="divide-y divide-gray-100">
                {requests.map(({ id, person }) => (
                  <div key={id} className="flex flex-wrap items-center gap-3 p-4">
                    {avatar(person)}
                    <div className="min-w-0 flex-1"><Link to={`/profile/${person.id}`} className="font-semibold hover:text-[#0a66c2] hover:underline">{person.firstname} {person.lastname}</Link><p className="text-sm text-gray-500">@{person.username} {person.headline && `· ${person.headline}`}</p></div>
                    <button onClick={() => respond(id, false)} disabled={workingId === id} className="rounded-full border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Ignore</button>
                    <button onClick={() => respond(id, true)} disabled={workingId === id} className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]">{workingId === id ? "Saving…" : "Accept"}</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {sentRequests.length > 0 && <section className="rounded-lg border border-gray-200 bg-white"><div className="border-b border-gray-100 px-5 py-4"><h2 className="font-semibold">Sent invitations ({sentRequests.length})</h2></div><div className="divide-y divide-gray-100">{sentRequests.map(({ id, person }) => <div key={id} className="flex items-center gap-3 p-4">{avatar(person)}<div className="min-w-0 flex-1"><Link to={`/profile/${person.id}`} className="font-semibold hover:text-[#0a66c2] hover:underline">{person.firstname} {person.lastname}</Link><p className="text-sm text-gray-500">Request pending</p></div></div>)}</div></section>}

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-semibold">People you’re connected to ({friends.length})</h2></div>
            {friends.length === 0 ? <div className="p-6 text-center"><p className="text-sm text-gray-500">Your connections will show up here.</p><NavLink to="/people" className="mt-3 inline-flex rounded-full border border-[#0a66c2] px-4 py-2 text-sm font-semibold text-[#0a66c2]">Discover people</NavLink></div> : (
              <div className="divide-y divide-gray-100">
                {friends.map((person) => (
                  <div key={person.id} className="flex items-center gap-3 p-4">
                    {avatar(person)}
                    <div className="min-w-0 flex-1"><Link to={`/profile/${person.id}`} className="font-semibold hover:text-[#0a66c2] hover:underline">{person.firstname} {person.lastname}</Link><p className="text-sm text-gray-500">@{person.username} {person.headline && `· ${person.headline}`}</p></div>
                    <NavLink to={`/messages/${person.id}`} className="rounded-full border border-[#0a66c2] px-4 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-blue-50">Message</NavLink>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default FriendsPage;
