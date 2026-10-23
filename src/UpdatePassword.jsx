import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const UpdatePassword = () => {
  const [password, setPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setHasRecoverySession(!sessionError && Boolean(data.session));
      setCheckingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === "PASSWORD_RECOVERY" || session)) {
        setHasRecoverySession(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  if (checkingSession) return <p>Verifying reset link...</p>;

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <header className="mx-auto max-w-6xl px-5 py-5">
        <NavLink to="/" className="flex w-fit items-center gap-2 text-2xl font-bold text-[#0a66c2]"><span className="grid h-9 w-9 place-items-center rounded bg-[#0a66c2] text-lg text-white">in</span>TKA Network</NavLink>
      </header>
      <main className="mx-auto max-w-md px-5 pb-12 pt-8">
      <section className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {!hasRecoverySession ? (
        <p role="alert" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          This reset link is invalid or expired. <NavLink to="/forgot">Request another link</NavLink>.
        </p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">New password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            minLength={6}
            required
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100"
          />
          </label>
          <button className="w-full rounded-full bg-[#0a66c2] py-3 font-semibold text-white hover:bg-[#004182] disabled:opacity-60" type="submit" disabled={saving}>
            {saving ? "Updating..." : "Update password"}
          </button>
          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </form>
      )}
      </section>
      </main>
    </div>
  );
};

export default UpdatePassword;
