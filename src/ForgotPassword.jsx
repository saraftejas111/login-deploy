import { useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/update-password` },
    );

    setSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("If an account exists for that email, a password reset link has been sent.");
  };

  return (
    <div>
      <h2>Reset password</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Enter your account email"
          autoComplete="email"
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <p><NavLink to="/">Back to login</NavLink></p>
    </div>
  );
};

export default ForgotPassword;
