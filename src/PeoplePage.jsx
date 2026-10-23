import { useState } from "react";
import { supabase } from "./supabaseClient";
import { getAvatarUrl } from "./avatars";
import { socialErrorMessage } from "./socialErrors";
import { Link } from "react-router-dom";
import EnlargeableImage from "./EnlargeableImage";

const initials = (person) => `${person.firstname?.[0] ?? ""}${person.lastname?.[0] ?? ""}`.toUpperCase() || "U";

const PeoplePage = () => {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [sent, setSent] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const search = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setError("");
    const { data, error: searchError } = await supabase.rpc("search_profiles", { search_text: query.trim() });
    setPeople(data ?? []);
    setLoading(false);
    if (searchError) setError(socialErrorMessage(searchError));
  };

  const sendRequest = async (personId) => {
    setSendingId(personId);
    setError("");
    const { error: requestError } = await supabase.rpc("send_friend_request", { target_user_id: personId });
    setSendingId(null);
    if (requestError) { setError(socialErrorMessage(requestError)); return; }
    setSent((current) => new Set(current).add(personId));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0a66c2]">Discover</p>
        <h1 className="mt-1 text-2xl font-semibold">Find people to connect with</h1>
        <p className="mt-2 text-sm text-gray-500">Search by first or last name, username, email, or Indian mobile number. Private contact details are never shown in results.</p>
        <form onSubmit={search} className="mt-5 flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-4 py-2.5 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" placeholder="Try a name, username, email, or mobile" />
          <button disabled={loading} className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-60">{loading ? "Searching…" : "Search"}</button>
        </form>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-gray-500">Searching people…</p>}
      {!loading && searched && people.length === 0 && !error && <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No matching people found. Try a different search.</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <article key={person.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4">
            {person.propic
              ? <EnlargeableImage src={getAvatarUrl(person.propic)} alt={`${person.firstname} ${person.lastname} profile picture`} className="h-14 w-14 shrink-0 overflow-hidden rounded-full" imageClassName="h-full w-full rounded-full object-cover" />
              : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{initials(person)}</div>}
            <div className="min-w-0 flex-1">
              <Link to={`/profile/${person.id}`} className="block truncate font-semibold hover:text-[#0a66c2] hover:underline">{person.firstname} {person.lastname}</Link>
              <p className="truncate text-sm text-gray-600">@{person.username}</p>
              <p className="mt-1 line-clamp-2 text-sm text-gray-500">{person.headline || person.bio || "TKA Network member"}</p>
              <button
                onClick={() => sendRequest(person.id)}
                disabled={sent.has(person.id) || sendingId === person.id}
                className="mt-3 rounded-full border border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              >
                {sent.has(person.id) ? "Request sent" : sendingId === person.id ? "Sending…" : "＋ Connect"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default PeoplePage;
