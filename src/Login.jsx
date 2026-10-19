
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const Login = () => {
  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const navigateMe = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email: form.username.trim(),
      password: form.password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setForm({ username: "", password: "" });
    navigateMe("/dashboard");
  };

  return (
    <div>
      <h2>Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          name="username"
          value={form.username}
          onChange={handleChange}
          placeholder="Enter your registered email"
          required
        />
        <br /><br />

        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Enter password"
          required
        />
        <br /><br />

        <button type="submit">Login</button>
      </form>

      <br /><br />

      <NavLink to="/signup">Sign Up</NavLink>{" "}
      <NavLink to="/forgot">Forgot Password?</NavLink>
    </div>
  );
};

export default Login;
