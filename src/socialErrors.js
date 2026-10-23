const missingSetupCodes = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

export const socialErrorMessage = (error) => {
  if (!error) return "";
  if (missingSetupCodes.has(error.code)) {
    return "Supabase social setup is missing. Run the social migrations in supabase/migrations in timestamp order, including 202610230003_network_feed_tags.sql, then try again.";
  }
  return error.message;
};
