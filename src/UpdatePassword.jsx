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
    <div>
      <h2>Choose a new password</h2>
      {!hasRecoverySession ? (
        <p role="alert">
          This reset link is invalid or expired. <NavLink to="/forgot">Request another link</NavLink>.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            minLength={6}
            required
          />
          <button type="submit" disabled={saving}>
            {saving ? "Updating..." : "Update password"}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
};

export default UpdatePassword;
