
import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Logout from "./Logout";

const Dashboard = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigateMe = useNavigate();

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        navigateMe("/");
        return;
      }

      const user = data.user;

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("firstname, lastname, email, mobile, username, propic")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) {
        console.error(profileError);
        alert("Could not load your profile.");
      }

      setUserInfo({
        ...profile,
        email: user.email,
      });

      setLoading(false);
    }

    loadProfile();
  }, [navigateMe]);

  if (loading) {
    return <h2>Loading Dashboard...</h2>;
  }

  if (!userInfo) {
    return <h2>Profile not found.</h2>;
  }

  return (
    <div>
      <h2>Welcome to User Dashboard</h2>

      <div style={{ marginLeft: "80%" }}>
        <Logout />
      </div>

      <NavLink to="/profile">Profile</NavLink>{" | "}
      <NavLink to="/message">Message</NavLink>

      <hr />

      {userInfo.propic && (
        <img
          src={userInfo.propic}
          alt="User Profile"
          width="130"
          height="130"
          style={{
            borderRadius: "50%",
            objectFit: "cover",
            border: "2px solid gray",
          }}
        />
      )}

      <h3>First Name: {userInfo.firstname}</h3>
      <h3>Last Name: {userInfo.lastname}</h3>
      <h3>Email: {userInfo.email}</h3>
      <h3>Mobile: {userInfo.mobile}</h3>
    </div>
  );
};

export default Dashboard;
