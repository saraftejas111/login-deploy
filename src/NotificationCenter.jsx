import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const descriptions = {
  friend_request: "sent you a friend request",
  friend_request_accepted: "accepted your friend request",
  message: "sent you a message",
  friend_post: "shared a post",
  like: "liked your post",
  comment: "commented on your post",
  repost: "reposted your post",
  tag: "tagged you in a post",
};

const NotificationCenter = () => {
  const [userId, setUserId] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState("");
  const navigate = useNavigate();
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const loadNotifications = useCallback(async (recipientId) => {
    if (!recipientId) return;
    const { data, error } = await supabase.from("notifications")
      .select("id, actor_id, event_type, entity_id, created_at, read_at")
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false }).limit(30);
    if (error) return;
    const actorIds = [...new Set((data ?? []).map((item) => item.actor_id))];
    const { data: actors } = actorIds.length
      ? await supabase.from("social_profiles").select("id, firstname, lastname, username, propic").in("id", actorIds)
      : { data: [] };
    const byId = new Map((actors ?? []).map((person) => [person.id, person]));
    setNotifications((data ?? []).map((item) => ({ ...item, actor: byId.get(item.actor_id) })));
  }, []);

  useEffect(() => {
    let channel;
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active || error || !data.user) return;
      const id = data.user.id;
      setUserId(id);
      void loadNotifications(id);
      channel = supabase.channel(`notification-events-${id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${id}`,
        }, (payload) => {
          const popupText = {
            friend_request: "You received a friend request.",
            friend_request_accepted: "Your friend request was accepted.",
            friend_post: "A friend shared a new post.",
            like: "Someone liked your post.",
            comment: "Someone commented on your post.",
            repost: "Someone reposted your post.",
            tag: "You were tagged in a post.",
          }[payload.new?.event_type] ?? "You have a new notification.";
          if (payload.new?.event_type !== "message") {
            setPopup(popupText);
            window.setTimeout(() => setPopup(""), 4500);
          }
          void loadNotifications(id);
        })
        .subscribe();
    });
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, [loadNotifications]);

  const openNotification = async (notification) => {
    if (!notification.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("id", notification.id).eq("recipient_id", userId);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    }
    setOpen(false);
    if (["friend_request", "friend_request_accepted"].includes(notification.event_type)) navigate("/friends");
    else if (notification.event_type === "message") navigate(`/messages/${notification.actor_id}`);
    else navigate(`/dashboard#post-${notification.entity_id}`);
  };

  const markAllRead = async () => {
    if (!userId || !unreadCount) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now })
      .eq("recipient_id", userId).is("read_at", null);
    if (!error) setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-label={`Notifications, ${unreadCount} unread`} className="relative rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100">
        <span className="text-xl">♢</span><span className="hidden text-[11px] sm:block">Notifications</span>
        {unreadCount > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {popup && <div role="status" className="fixed right-4 top-16 z-50 max-w-sm rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">{popup}<button onClick={() => setPopup("")} className="ml-3 font-bold" aria-label="Dismiss">×</button></div>}
      {open && <section className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><h2 className="font-semibold">Notifications</h2><button onClick={markAllRead} className="text-xs font-semibold text-[#0a66c2] hover:underline">Mark all read</button></div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? <p className="p-5 text-sm text-gray-500">You’re all caught up.</p> : notifications.map((item) => <div key={item.id} className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 ${item.read_at ? "" : "bg-blue-50/70"}`}>
            {item.actor?.propic ? <img src={item.actor.propic.startsWith("storage:avatars/") ? supabase.storage.from("avatars").getPublicUrl(item.actor.propic.slice("storage:avatars/".length)).data.publicUrl : item.actor.propic} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">{item.actor?.firstname?.[0] ?? "?"}</span>}
            <span className="min-w-0 flex-1 text-sm">{item.actor ? <Link to={`/profile/${item.actor_id}`} onClick={() => setOpen(false)} className="font-semibold hover:text-[#0a66c2] hover:underline">{item.actor.firstname} {item.actor.lastname}</Link> : <span className="font-semibold">Someone</span>} <button onClick={() => openNotification(item)} className="text-left hover:text-[#0a66c2]">{descriptions[item.event_type] ?? "updated your network"}<span className="mt-1 block text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</span></button></span>
            {!item.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0a66c2]" />}
          </div>)}
        </div>
      </section>}
    </div>
  );
};

export default NotificationCenter;
