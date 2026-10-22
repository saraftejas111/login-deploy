
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Logout from "./Logout";

const Dashboard = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigateMe = useNavigate();

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        if (active) navigateMe("/", { replace: true });
        return;
      }

      const user = authData.user;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("firstname, lastname, email, mobile, username, propic")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      if (profileError) {
        console.error("Profile loading error:", profileError.message);
      }

      setUserInfo({
        firstname: profile?.firstname || "",
        lastname: profile?.lastname || "",
        email: profile?.email || user.email || "",
        mobile: profile?.mobile || "",
        username: profile?.username || "",
        propic: profile?.propic || ""
      });

      setLoading(false);
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigateMe]);

  if (loading) {
    return <h2>Loading Dashboard...</h2>;
  }

  if (!userInfo) {
    return null;
  }

  return (
    <div>
      <h2>Welcome to User Dashboard</h2>

      {userInfo.propic && (
        <img
          src={userInfo.propic}
          alt="Profile"
          width="100"
          height="100"
          style={{ borderRadius: "50%", objectFit: "cover" }}
        />
      )}

      <h3>User Profile</h3>

      <p>First Name: {userInfo.firstname}</p>
      <p>Last Name: {userInfo.lastname}</p>
      <p>Email: {userInfo.email}</p>
      <p>Mobile: {userInfo.mobile}</p>

      <NavLink to="/profile">Profile</NavLink>
      {" | "}
      <NavLink to="/message">Message</NavLink>

      <br /><br />

      <Logout />
    </div>
  );
};

export default Dashboard;
