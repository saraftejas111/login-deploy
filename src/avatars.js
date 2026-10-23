import { supabase } from "./supabaseClient";

export const getAvatarUrl = (value) => {
  if (!value) return "";
  const marker = "storage:avatars/";
  if (!value.startsWith(marker)) return value;
  return supabase.storage.from("avatars").getPublicUrl(value.slice(marker.length)).data.publicUrl;
};

export const getSignedMediaUrl = async (value) => {
  if (!value) return "";
  const marker = "storage:post-media/";
  if (!value.startsWith(marker)) return value;
  const { data, error } = await supabase.storage.from("post-media")
    .createSignedUrl(value.slice(marker.length), 3600);
  if (error) throw error;
  return data.signedUrl;
};

export const uploadAvatar = async (userId, file) => {
  if (!userId) throw new Error("Sign in before uploading a profile picture.");
  if (!file?.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 1024 * 1024) throw new Error("Choose an image smaller than 1 MB.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: saveError } = await supabase.rpc("set_my_avatar_path", { p_path: path });
  if (saveError) throw saveError;
  return getAvatarUrl(`storage:avatars/${path}`);
};

export const uploadPostImage = async (userId, file) => {
  if (!userId) throw new Error("Sign in before uploading a post picture.");
  if (!file?.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("post-media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return `storage:post-media/${path}`;
};
