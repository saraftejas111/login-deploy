import { supabase } from "./supabaseClient";

export const callAccountAccess = async (payload) => {
  const { data, error } = await supabase.functions.invoke("account-access", {
    body: payload,
  });

  if (error) {
    let detail = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) detail = body.error;
    } catch {
      // Keep the Functions client error when the response has no JSON body.
    }
    throw new Error(detail);
  }

  if (data?.error) throw new Error(data.error);
  return data;
};
