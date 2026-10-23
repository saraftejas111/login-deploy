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
    <div className="min-h-screen bg-[#f3f2ef]">
      <header className="mx-auto max-w-6xl px-5 py-5">
        <NavLink to="/" className="flex w-fit items-center gap-2 text-2xl font-bold text-[#0a66c2]"><span className="grid h-9 w-9 place-items-center rounded bg-[#0a66c2] text-lg text-white">in</span>TKA Network</NavLink>
      </header>
      <main className="mx-auto max-w-md px-5 pb-12 pt-8">
      <section className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-gray-600">Find your account, then answer the security question you set when you signed up.</p>

      {step === "lookup" && (
        <form className="mt-6 space-y-4" onSubmit={(event) => run(event, "question")}>
          <label className="block text-sm font-medium">Username, email, or mobile
          <input
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Enter username, email, or mobile"
            autoComplete="username"
            required
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100"
          />
          </label>
          <button className="w-full rounded-full bg-[#0a66c2] py-3 font-semibold text-white hover:bg-[#004182] disabled:opacity-60" type="submit" disabled={busy}>
            {busy ? "Checking..." : "Find account"}
          </button>
        </form>
      )}

      {step === "answer" && (
        <form className="mt-6 space-y-4" onSubmit={(event) => run(event, "verify")}>
          <p className="rounded-md bg-blue-50 p-3 text-sm font-medium text-gray-800">{question}</p>
          <label className="block text-sm font-medium">Your answer
          <input
            type="text"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Your security answer"
            required
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100"
          />
          </label>
          <button className="w-full rounded-full bg-[#0a66c2] py-3 font-semibold text-white hover:bg-[#004182] disabled:opacity-60" type="submit" disabled={busy}>
            {busy ? "Checking..." : "Verify answer"}
          </button>
        </form>
      )}

      {step === "password" && (
        <form className="mt-6 space-y-4" onSubmit={(event) => run(event, "change")}>
          <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Answer verified. Choose a new password.</p>
          <label className="block text-sm font-medium">New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            minLength={6}
            required
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100"
          />
          </label>
          <button className="w-full rounded-full bg-[#0a66c2] py-3 font-semibold text-white hover:bg-[#004182] disabled:opacity-60" type="submit" disabled={busy}>
            {busy ? "Changing..." : "Change password"}
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      <p className="mt-6 text-center text-sm"><NavLink className="font-semibold text-[#0a66c2] hover:underline" to="/">Back to sign in</NavLink></p>
      </section>
      </main>
    </div>
  );
};

export default ForgotPassword;
