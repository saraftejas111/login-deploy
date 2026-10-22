
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "./supabaseClient";

const ProtectedRoute = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkUser() {
      const { data, error } = await supabase.auth.getUser();

      if (mounted) {
        setUser(error ? null : data.user);
        setLoading(false);
      }
    }

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
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

  return user ? <Outlet /> : <Navigate to="/" replace />;
};

export default ProtectedRoute;
