import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { getAvatarUrl, uploadAvatar } from "./avatars";
import EnlargeableImage from "./EnlargeableImage";

const ProfilePage = () => {
  const { userId: viewedUserId } = useParams();
  const [form, setForm] = useState({ headline: "", bio: "", location: "" });
  const [profile, setProfile] = useState(null);
  const [userId, setUserId] = useState("");
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        if (active) { setError(authError?.message ?? "Please sign in again."); setLoading(false); }
        return;
      }
      setUserId(authData.user.id);
      const targetId = viewedUserId || authData.user.id;
      const isOwnProfile = targetId === authData.user.id;
      const { data, error: profileError } = await supabase
        .from("social_profiles")
        .select("id, username, firstname, lastname, propic, headline, bio, location")
        .eq("id", targetId)
        .maybeSingle();
      if (!active) return;
      if (profileError) setError(profileError.message);
      if (!data) { setError("This profile is unavailable."); setLoading(false); return; }
      setProfile(data);
      if (!isOwnProfile) { setLoading(false); return; }
      setContact({
        email: authData.user.email ?? "",
        phone: authData.user.user_metadata?.mobile ?? "",
      });
      const { data: privateContact } = await supabase.rpc("get_my_private_contact");
      const ownContact = Array.isArray(privateContact) ? privateContact[0] : privateContact;
      setContact({
        email: authData.user.email ?? ownContact?.email ?? "",
        phone: ownContact?.mobile ?? authData.user.user_metadata?.mobile ?? "",
      });
      const metadata = authData.user.user_metadata ?? {};
      const ownProfile = {
        ...data,
        firstname: data?.firstname || metadata.firstname || "",
        lastname: data?.lastname || metadata.lastname || "",
        username: data?.username || metadata.username || "",
        propic: data?.propic || metadata.avatar_url || "",
      };
      setProfile(ownProfile);
      setForm({ headline: ownProfile.headline ?? "", bio: ownProfile.bio ?? "", location: ownProfile.location ?? "" });
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [viewedUserId]);

  const changeAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      await uploadAvatar(userId, file);
      // uploadAvatar stores the generated path in the profile. Reload it so the
      // profile reflects the canonical path saved by the database RPC.
      const { data, error: profileError } = await supabase
        .from("social_profiles")
        .select("id, username, firstname, lastname, propic, headline, bio, location")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      setProfile(data);
      setMessage("Profile picture updated.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.rpc("update_my_social_profile", {
      p_headline: form.headline,
      p_bio: form.bio,
      p_location: form.location,
    });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setMessage("Profile updated.");
  };

  if (loading) return <div className="py-16 text-center text-gray-500">Loading profile…</div>;

  if (profile && viewedUserId && viewedUserId !== userId) return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="h-32 bg-gradient-to-r from-[#0a66c2] via-[#70b5f9] to-[#dbeafe]" />
        <div className="px-6 pb-6">
          {profile.propic ? <EnlargeableImage src={getAvatarUrl(profile.propic)} alt={`${profile.firstname} ${profile.lastname} profile picture`} className="-mt-12 block h-24 w-24 overflow-hidden rounded-full border-4 border-white" imageClassName="h-full w-full rounded-full object-cover" /> : <div className="-mt-12 grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-blue-100 text-2xl font-bold text-blue-700">{profile.firstname?.[0] ?? "U"}</div>}
          <h1 className="mt-3 text-2xl font-semibold">{profile.firstname} {profile.lastname}</h1>
          <p className="text-sm text-gray-600">@{profile.username}</p>
          {profile.headline && <p className="mt-3 text-sm text-gray-700">{profile.headline}</p>}
          {profile.location && <p className="mt-1 text-sm text-gray-500">{profile.location}</p>}
        </div>
      </section>
      {profile.bio && <section className="rounded-lg border border-gray-200 bg-white p-6"><h2 className="font-semibold">About</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{profile.bio}</p></section>}
      <Link to={`/messages/${profile.id}`} className="inline-flex rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white">Message</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="h-32 bg-gradient-to-r from-[#0a66c2] via-[#70b5f9] to-[#dbeafe]" />
        <div className="px-6 pb-6">
          {profile?.propic
            ? <EnlargeableImage src={getAvatarUrl(profile.propic)} alt="Profile picture" className="-mt-12 block h-24 w-24 overflow-hidden rounded-full border-4 border-white" imageClassName="h-full w-full rounded-full object-cover" />
            : <div className="-mt-12 grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-blue-100 text-2xl font-bold text-blue-700">{profile?.firstname?.[0] ?? "U"}</div>}
          <h1 className="mt-3 text-2xl font-semibold">{profile?.firstname} {profile?.lastname}</h1>
          <p className="text-sm text-gray-600">@{profile?.username}</p>
          {profile?.location && <p className="mt-1 text-sm text-gray-500">{profile.location}</p>}
          <label className="mt-3 inline-flex cursor-pointer rounded-full border border-[#0a66c2] px-4 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-blue-50">
            {uploading ? "Uploading picture..." : "Change profile picture"}
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={uploading} onChange={changeAvatar} className="sr-only" />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Private account details</h2>
        <p className="mt-1 text-sm text-gray-500">These details are private to your account and are not shown to friends.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Verified email<input readOnly value={contact.email} className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-gray-600" /></label>
          <label className="block text-sm font-medium">Mobile number (private)<input readOnly value={contact.phone || "Not added"} className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-gray-600" /><span className="mt-1 block text-xs font-normal text-gray-500">Only you can see this number. It is not verified.</span></label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Edit your profile</h2>
        <p className="mt-1 text-sm text-gray-500">Help people understand what you do and what you’re interested in.</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">Headline
            <input maxLength={160} value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" placeholder="e.g. Product designer | Building accessible experiences" />
          </label>
          <label className="block text-sm font-medium">Location
            <input maxLength={120} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" placeholder="City, country" />
          </label>
          <label className="block text-sm font-medium">About
            <textarea maxLength={2000} rows={5} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" placeholder="Share a little about your work and interests" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="text-sm text-green-700">{message}</p>}
          <button disabled={saving} className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button>
        </form>
      </section>
    </div>
  );
};

export default ProfilePage;
