import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { callAccountAccess } from "./accountAccess";

const ForgotPassword = () => {
  const [identifier, setIdentifier] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState("lookup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const run = async (event, action) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (action === "question") {
        const result = await callAccountAccess({
          action: "question",
          identifier: identifier.trim(),
        });
        setQuestion(result.securityQuestion);
        setStep("answer");
      }

      if (action === "verify") {
        await callAccountAccess({
          action: "verify-answer",
          identifier: identifier.trim(),
          securityAnswer: answer,
        });
        setStep("password");
      }

      if (action === "change") {
        await callAccountAccess({
          action: "change-password",
          identifier: identifier.trim(),
          securityAnswer: answer,
          newPassword,
        });
        setMessage("Password changed. You can now log in with your new password.");
        setTimeout(() => navigate("/", { replace: true }), 1400);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Forgot password</h2>

      {step === "lookup" && (
        <form onSubmit={(event) => run(event, "question")}>
          <input
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Enter username, email, or mobile"
            autoComplete="username"
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Checking..." : "Find account"}
          </button>
        </form>
      )}

      {step === "answer" && (
        <form onSubmit={(event) => run(event, "verify")}>
          <p>{question}</p>
          <input
            type="text"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Your security answer"
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Checking..." : "Verify answer"}
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={(event) => run(event, "change")}>
          <p>Answer verified. Choose a new password.</p>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            minLength={6}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Changing..." : "Change password"}
          </button>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p><NavLink to="/">Back to login</NavLink></p>
    </div>
  );
};

export default ForgotPassword;
