import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { uploadAvatar } from "./avatars";

const PENDING_SIGNUP_KEY = "tka-pending-signup";

const toIndianMobileDigits = (value) => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
};

const toIndianPhoneE164 = (value) => {
  const mobile = toIndianMobileDigits(value);
  if (!/^[6-9][0-9]{9}$/.test(mobile)) {
    throw new Error("Enter a valid 10-digit Indian mobile number starting with 6-9.");
  }
  return `+91${mobile}`;
};

const getPendingSignup = () => {
  try { return JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) ?? "null"); }
  catch { return null; }
};

const savePendingSignup = (value) => {
  try { localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(value)); }
  catch { /* Signup can continue if this browser cannot store the optional photo draft. */ }
};

const isDeletedUserSessionError = (error) =>
  /user from sub claim in jwt does not exist|user.*does not exist/i.test(error?.message ?? "");

const hashSecurityAnswer = async (answer) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(answer.trim().normalize("NFKC").toLowerCase()), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  return `pbkdf2-sha256$210000$${toBase64(salt)}$${toBase64(new Uint8Array(hash))}`;
};

const Signup = () => {
  const [form, setForm] = useState({ firstname: "", lastname: "", email: "", mobile: "", username: "", password: "", securityquestion: "What is Your Pet Name?", securityanswer: "" });
  const [step, setStep] = useState("details");
  const [emailLinkType, setEmailLinkType] = useState("signup");
  const completionStarted = useRef(false);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return query.get("error_description") ?? hash.get("error_description") ?? "";
  });
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);

    const resumeFromEmailLink = async (user) => {
      if (!active || !user?.email_confirmed_at) return;
      if (completionStarted.current) return;
      completionStarted.current = true;
      const draft = getPendingSignup();
      setForm((current) => ({
        ...current,
        email: user.email ?? current.email,
        mobile: draft?.email === user.email
          ? (draft.mobile ?? "")
          : toIndianMobileDigits(user.user_metadata?.mobile ?? user.phone ?? current.mobile),
        firstname: user.user_metadata?.firstname ?? current.firstname,
        lastname: user.user_metadata?.lastname ?? current.lastname,
        username: user.user_metadata?.username ?? current.username,
      }));
      if (draft?.email === user.email && draft.imageDataUrl) {
        setPreview(draft.imageDataUrl);
      }
      setBusy(true);
      let signupNotice;
      if (draft?.email === user.email && draft.imageDataUrl) {
        try {
          const avatarBlob = await fetch(draft.imageDataUrl).then((response) => response.blob());
          const avatarFile = new File([avatarBlob], "profile-picture", { type: avatarBlob.type });
          await uploadAvatar(user.id, avatarFile);
        } catch (uploadError) {
          signupNotice = `Your account is ready, but the profile picture could not be saved: ${uploadError.message}`;
        }
      }
      try { localStorage.removeItem(PENDING_SIGNUP_KEY); } catch { /* Ignore unavailable browser storage. */ }
      if (!active) return;
      setBusy(false);
      navigate("/dashboard", { replace: true, state: signupNotice ? { signupNotice } : undefined });
    };

    const recoverSession = async (candidateUser) => {
      if (!candidateUser) return;
      // A browser may retain a JWT after its Auth user was deleted in the
      // Dashboard/SQL editor. Validate it with Auth before showing the phone
      // step, which would otherwise show a confusing JWT error.
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (!active) return;
      if (sessionError) {
        if (isDeletedUserSessionError(sessionError)) {
          await supabase.auth.signOut({ scope: "local" });
          if (!active) return;
          setStep("details");
          setError("This signup account was deleted from Supabase. Start signup again with a new account.");
        }
        return;
      }
      resumeFromEmailLink(data.user);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) queueMicrotask(() => { void recoverSession(session.user); });
    });
    supabase.auth.getUser().then(({ data, error: sessionError }) => {
      if (sessionError && isDeletedUserSessionError(sessionError)) {
        void recoverSession({ id: "stale-session" });
      } else {
        void recoverSession(data.user);
      }
    });
    const tokenHash = query.get("token_hash");
    const tokenType = query.get("type");
    if (tokenHash && tokenType) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: tokenType })
        .then(({ data, error: verifyError }) => {
          if (!active) return;
          if (verifyError) setError(verifyError.message);
          else resumeFromEmailLink(data.user);
        });
    }
    return () => { active = false; subscription.unsubscribe(); };
  }, [navigate]);

  const handleChange = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1024 * 1024) {
      setError("Choose an image smaller than 1 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setImageDataUrl(dataUrl);
      setPreview(dataUrl);
      savePendingSignup({ email: form.email.trim().toLowerCase(), mobile: form.mobile, imageDataUrl: dataUrl });
    };
    reader.readAsDataURL(file);
    setError("");
  };

  const resumeExistingSignup = async () => {
    const email = form.email.trim().toLowerCase();
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password: form.password });

    if (loginError) {
      if (/email not confirmed/i.test(loginError.message)) {
        const { error: resendError } = await supabase.auth.resend({
          type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/signup` },
        });
        if (resendError) throw resendError;
        setEmailLinkType("signup");
        setStep("emailLink");
        setNotice(`This signup is pending. Open the confirmation link sent to ${email}.`);
        return;
      }
      throw new Error("This email already has an account. Sign in, or enter the password used for the pending signup to continue verification.");
    }

    const user = data.user;
    if (user.email_confirmed_at) {
      navigate("/dashboard", { replace: true });
      return;
    }

    const pendingPhone = user.user_metadata?.mobile ?? user.phone ?? form.mobile;
    setForm((current) => ({
      ...current,
      email,
      mobile: toIndianMobileDigits(pendingPhone),
      firstname: user.user_metadata?.firstname ?? current.firstname,
      lastname: user.user_metadata?.lastname ?? current.lastname,
      username: user.user_metadata?.username ?? current.username,
    }));

    if (!user.email_confirmed_at) {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/signup` },
      });
      if (resendError) throw resendError;
      setStep("emailLink");
      setNotice(`Open the confirmation link sent to ${email}.`);
      return;
    }

    setStep("emailLink");
    setEmailLinkType("signup");
    setNotice(`Open the confirmation link sent to ${email}.`);
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      toIndianPhoneE164(form.mobile);
      savePendingSignup({ email: form.email.trim().toLowerCase(), mobile: form.mobile, imageDataUrl });
      const securityAnswerHash = await hashSecurityAnswer(form.securityanswer);
      const { data, error: signupError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: {
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          mobile: toIndianPhoneE164(form.mobile),
          username: form.username.trim().toLowerCase(),
          securityquestion: form.securityquestion,
          securityanswer: securityAnswerHash,
        }, emailRedirectTo: `${window.location.origin}/signup` },
      });
      if (signupError) {
        if (/already registered|already exists/i.test(signupError.message)) {
          await resumeExistingSignup();
          return;
        }
        throw signupError;
      }
      if (!data.user) throw new Error("Account creation failed.");
      if (!data.session && data.user.identities?.length === 0) {
        await resumeExistingSignup();
        return;
      }

      if (data.session) {
        // If email confirmation is disabled, still require a link click.
        await supabase.auth.signOut();
        setEmailLinkType("signin");
        const { error: linkError } = await supabase.auth.signInWithOtp({
          email: form.email.trim().toLowerCase(),
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/signup` },
        });
        if (linkError) throw linkError;
      } else {
        setEmailLinkType("signup");
      }
      setStep("emailLink");
      setNotice(`Open the confirmation link sent to ${form.email.trim()}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(false); }
  };

  const resendEmailLink = async () => {
    setBusy(true); setError("");
    try {
      const email = form.email.trim().toLowerCase();
      const result = emailLinkType === "signup"
        ? await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/signup` } })
        : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/signup` } });
      const { error: resendError } = result;
      if (resendError) throw resendError;
      setNotice("A new confirmation link has been sent.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const inputClass = "mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2.5 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100";

  return (
    <div className="min-h-screen bg-[#f3f2ef] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <NavLink to="/" className="mb-6 flex items-center justify-center gap-2 text-2xl font-bold text-[#0a66c2]"><span className="grid h-9 w-9 place-items-center rounded bg-[#0a66c2] text-lg text-white">in</span>TKA Network</NavLink>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-9">
          <h1 className="text-2xl font-semibold">{step === "details" ? "Join your professional community" : "Confirm your email"}</h1>
          <p className="mt-1 text-sm text-gray-500">{step === "details" ? "Create your profile. Confirm your email to finish signup." : `Open the confirmation link sent to ${form.email}.`}</p>

          {step === "details" && <form onSubmit={createAccount} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">First name<input name="firstname" value={form.firstname} onChange={handleChange} required className={inputClass} /></label>
            <label className="text-sm font-medium">Last name<input name="lastname" value={form.lastname} onChange={handleChange} required className={inputClass} /></label>
            <label className="text-sm font-medium sm:col-span-2">Email<input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" required className={inputClass} /></label>
            <label className="text-sm font-medium">Username<input name="username" value={form.username} onChange={handleChange} autoComplete="username" required className={inputClass} /></label>
            <label className="text-sm font-medium">Indian mobile number (contact only)<div className="mt-1.5 flex overflow-hidden rounded-md border border-gray-300 focus-within:border-[#0a66c2] focus-within:ring-2 focus-within:ring-blue-100"><span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-gray-600">+91</span><input type="tel" inputMode="numeric" autoComplete="tel-national" name="mobile" value={form.mobile} onChange={(event) => setForm((current) => ({ ...current, mobile: toIndianMobileDigits(event.target.value) }))} placeholder="9876543210" maxLength={12} pattern="^[6-9][0-9]{9}$" title="Enter a 10-digit Indian mobile number starting with 6-9" required className="min-w-0 flex-1 px-3 py-2.5 outline-none" /></div></label>
            <label className="text-sm font-medium sm:col-span-2">Password<input type="password" name="password" value={form.password} onChange={handleChange} minLength={6} autoComplete="new-password" required className={inputClass} /></label>
            <label className="text-sm font-medium sm:col-span-2">Recovery question<select name="securityquestion" value={form.securityquestion} onChange={handleChange} required className={`${inputClass} bg-white`}><option>What is Your Pet Name?</option><option>What is Your Best Friend Name?</option><option>What is Your Teacher Name?</option><option>What is Your Hobby?</option></select></label>
            <label className="text-sm font-medium sm:col-span-2">Recovery answer<input name="securityanswer" value={form.securityanswer} onChange={handleChange} required className={inputClass} /></label>
            <label className="text-sm font-medium sm:col-span-2">Profile picture<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleImageChange} required className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-[#0a66c2]`} /></label>
            {preview && <img src={preview} alt="Profile preview" className="h-24 w-24 rounded-full object-cover sm:col-span-2" />}
            <button disabled={busy} className="rounded-full bg-[#0a66c2] px-5 py-3 font-semibold text-white hover:bg-[#004182] disabled:opacity-60 sm:col-span-2">{busy ? "Creating account..." : "Create account"}</button>
          </form>}

          {step === "emailLink" && <div className="mt-6 space-y-4">
            <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">No code is needed. Click the confirmation link in the email; this page will continue signup.</p>
            <button type="button" disabled={busy} onClick={resendEmailLink} className="w-full text-sm font-semibold text-[#0a66c2] hover:underline">{busy ? "Sending..." : "Resend confirmation link"}</button>
          </div>}

          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}
          {step === "details" && <p className="mt-5 text-center text-sm text-gray-600">Already have an account? <NavLink to="/" className="font-semibold text-[#0a66c2] hover:underline">Sign in</NavLink></p>}
        </section>
      </div>
    </div>
  );
};

export default Signup;
