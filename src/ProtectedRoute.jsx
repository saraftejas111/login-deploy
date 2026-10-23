
import { useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { supabase } from "./supabaseClient";

const ProtectedRoute = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkUser() {
      const { data, error } = await supabase.auth.getUser();

      if (mounted) {
        const currentUser = error ? null : data.user;
        setUser(currentUser);
        setNeedsVerification(Boolean(currentUser && !currentUser.email_confirmed_at));
        setLoading(false);
      }
    }

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setNeedsVerification(Boolean(currentUser && !currentUser.email_confirmed_at));
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <h2>Checking login...</h2>;
  }

  if (needsVerification) {
    return <main className="mx-auto mt-16 max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold">Verify your email to continue</h1>
      <p className="mt-2 text-sm text-gray-600">Open the confirmation link sent to your email, then sign in again.</p>
      <Link to="/signup" className="mt-5 inline-block rounded-full bg-[#0a66c2] px-5 py-2.5 text-sm font-semibold text-white">Return to signup</Link>
    </main>;
  }

  return user ? <Outlet /> : <Navigate to="/" replace />;
};

export default ProtectedRoute;
