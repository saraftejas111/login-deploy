
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { callAccountAccess } from "./accountAccess";

const Login = () => {
  const [form, setForm] = useState({
    username: "",
    password: ""
  });
  const [errorMessage, setErrorMessage] = useState("");

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
    setErrorMessage("");

    try {
      const result = await callAccountAccess({
        action: "login",
        identifier: form.username.trim(),
        password: form.password,
      });

      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (error) throw error;
    } catch (error) {
      setErrorMessage(error.message);
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

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <p>
        Don't have an account?{" "}
        <NavLink to="/signup">Signup</NavLink>
      </p>

      <NavLink to="/forgot">Forgot Password?</NavLink>
    </div>
  );
};

export default Login;
