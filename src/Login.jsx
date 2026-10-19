
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const Login = () => {
  const [form, setForm] = useState({
    username: "",
    password: ""
  });

  const navigateMe = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm({
      ...form,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const identifier = form.username.trim();
    let email = identifier;

    // If the input is not an email, search by username or mobile
    if (!identifier.includes("@")) {
      const { data, error } = await supabase
        .from("profiles")
        .select("email")
        .or(`username.eq.${identifier},mobile.eq.${identifier}`)
        .limit(1)
        .maybeSingle();

      if (error || !data?.email) {
        alert("Username, email, or mobile number not found.");
        return;
      }

      email = data.email;
    }

    // Verify password using Supabase Auth
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: form.password
    });

    if (error) {
      alert("Invalid login credentials.");
      return;
    }

    setForm({
      username: "",
      password: ""
    });

    navigateMe("/dashboard");
  };

  return (
    <div>
      <h2>Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          placeholder="Enter username, email, or mobile"
          value={form.username}
          onChange={handleChange}
          required
        />

        <br /><br />

        <input
          type="password"
          name="password"
          placeholder="Enter password"
          value={form.password}
          onChange={handleChange}
          required
        />

        <br /><br />

        <button type="submit">Login</button>
      </form>

      <p>
        Don't have an account?{" "}
        <NavLink to="/signup">Signup</NavLink>
      </p>

      <NavLink to="/forgot">Forgot Password?</NavLink>
    </div>
  );
};

export default Login;
