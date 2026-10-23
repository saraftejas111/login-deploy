import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

function getKey(pluralName: string, singularName: string, legacyName: string) {
  const rawKeys = Deno.env.get(pluralName);
  if (rawKeys) {
    try {
      const keys = JSON.parse(rawKeys);
      if (typeof keys.default === "string") return keys.default;
      const firstKey = Object.values(keys).find((value) => typeof value === "string");
      if (typeof firstKey === "string") return firstKey;
    } catch {
      // Fall through to singular and legacy key names for local/older projects.
    }
  }
  const key = Deno.env.get(singularName) ?? Deno.env.get(legacyName);
  if (!key) throw new Error(`Missing Supabase key in ${pluralName}.`);
  return key;
}

const anonKey = getKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
const serviceRoleKey = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function rowsFor(column: "email" | "username" | "mobile", value: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, username, mobile, securityquestion, securityanswer")
    .eq(column, value)
    .limit(2);
  if (error) throw new RequestError(`Profile lookup failed: ${error.message}`, 500);
  return data ?? [];
}

function normalizeIndianMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return value;
}

async function findProfile(identifier: string) {
  const raw = identifier.trim();
  if (!raw || raw.length > 254) throw new RequestError("Enter your username, email, or mobile number.");

  let matches;
  if (raw.includes("@")) {
    matches = await rowsFor("email", raw.toLowerCase());
  } else {
    const mobileIdentifier = normalizeIndianMobile(raw);
    const [usernames, mobiles] = await Promise.all([
      rowsFor("username", raw.toLowerCase()),
      rowsFor("mobile", mobileIdentifier),
    ]);
    matches = [...usernames, ...mobiles];
  }

  const unique = [...new Map(matches.map((profile) => [profile.id, profile])).values()];
  if (unique.length > 1) {
    throw new RequestError("That identifier matches more than one account. Use your email address.", 409);
  }
  if (!unique[0]) throw new RequestError("Account or credentials were not found.", 404);
  return unique[0];
}

function normalizeAnswer(value: unknown) {
  return String(value ?? "").trim().normalize("NFKC").toLowerCase();
}

async function verifyAnswer(answer: string, storedValue: string | null) {
  if (!storedValue || !answer.trim()) return false;
  const parts = storedValue.split("$");

  // Older profiles may still have a plain answer. New signups store a salted PBKDF2 hash.
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    return normalizeAnswer(answer) === normalizeAnswer(storedValue);
  }

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
  const salt = Uint8Array.from(atob(parts[2]), (char) => char.charCodeAt(0));
  const expected = Uint8Array.from(atob(parts[3]), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizeAnswer(answer)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expected.length * 8,
  ));
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function hashAnswer(answer: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizeAnswer(answer)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    key,
    256,
  ));
  const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  return `pbkdf2-sha256$210000$${base64(salt)}$${base64(hash)}`;
}

async function consumeAttempt(request: Request, identifier: string) {
  const clientIp = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rawKey = `${clientIp}|${identifier.trim().toLowerCase()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
  const keyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.rpc("consume_account_access_attempt", {
    p_key_hash: keyHash,
    p_max_attempts: 20,
    p_window_seconds: 900,
  });
  if (error) throw new RequestError("Account service is not configured. Apply its Supabase setup SQL.", 503);
  if (!data) throw new RequestError("Too many attempts. Try again in 15 minutes.", 429);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const identifier = String(body.identifier ?? "");
    if (action !== "set-security-question") await consumeAttempt(request, identifier);

    if (action === "login") {
      const password = String(body.password ?? "");
      const email = identifier.includes("@")
        ? identifier.trim().toLowerCase()
        : (await findProfile(identifier)).email;
      if (!email) throw new RequestError("Account or credentials were not found.", 401);

      const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) {
        throw new RequestError("Invalid username, email, mobile number, or password.", 401);
      }
      if (!data.user.email_confirmed_at) {
        throw new RequestError("Verify your email before signing in.", 403);
      }
      return json({ session: data.session });
    }

    if (action === "question" || action === "verify-answer" || action === "change-password") {
      const profile = await findProfile(identifier);

      if (action === "question") {
        if (!profile.securityquestion || !profile.securityanswer) {
          throw new RequestError("No security question is set for this account.", 409);
        }
        return json({ securityQuestion: profile.securityquestion });
      }

      const matches = await verifyAnswer(String(body.securityAnswer ?? ""), profile.securityanswer);
      if (!matches) throw new RequestError("Security answer does not match.", 401);

      if (action === "verify-answer") return json({ verified: true });

      const newPassword = String(body.newPassword ?? "");
      if (newPassword.length < 6) throw new RequestError("Password must be at least 6 characters.");
      const { error } = await admin.auth.admin.updateUserById(profile.id, { password: newPassword });
      if (error) throw new RequestError(`Password update failed: ${error.message}`, 500);
      return json({ updated: true });
    }

    if (action === "set-security-question") {
      const authorization = request.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer ")) {
        throw new RequestError("Please log in before setting a recovery question.", 401);
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData.user) {
        throw new RequestError("Your login session expired. Please log in again.", 401);
      }

      const allowedQuestions = new Set([
        "What is Your Pet Name?",
        "What is Your Best Friend Name?",
        "What is Your Teacher Name?",
        "What is Your Hobby?",
      ]);
      const securityQuestion = String(body.securityQuestion ?? "");
      const securityAnswer = String(body.securityAnswer ?? "");
      if (!allowedQuestions.has(securityQuestion)) {
        throw new RequestError("Choose a valid security question.");
      }
      if (normalizeAnswer(securityAnswer).length < 2 || securityAnswer.length > 200) {
        throw new RequestError("Enter a security answer between 2 and 200 characters.");
      }

      const { data: updatedProfile, error } = await admin
        .from("profiles")
        .update({ securityquestion: securityQuestion, securityanswer: await hashAnswer(securityAnswer) })
        .eq("id", userData.user.id)
        .select("id")
        .maybeSingle();
      if (error) throw new RequestError(`Could not save the recovery question: ${error.message}`, 500);
      if (!updatedProfile) {
        throw new RequestError("Your profile is missing. Run the Supabase setup SQL, then try again.", 404);
      }
      return json({ saved: true });
    }

    throw new RequestError("Unsupported account action.");
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("account-access error", error);
    return json({ error: "Account request failed. Please try again." }, 500);
  }
});
