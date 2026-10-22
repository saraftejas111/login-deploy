
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

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

      if (error) {
        setErrorMessage(`Could not look up that username/mobile: ${error.message}`);
        return;
      }
      if (!data?.email) {
        setErrorMessage("Username or mobile was not found in the profiles table. Try your account email.");
        return;
      }

      email = data.email;
    }

    // Verify password using Supabase Auth
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: form.password
    });

    if (error) {
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
