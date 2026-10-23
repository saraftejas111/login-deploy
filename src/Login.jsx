
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
    <div className="min-h-screen bg-[#f3f2ef]">
      <header className="mx-auto flex max-w-6xl items-center px-5 py-5">
        <NavLink to="/" className="flex items-center gap-2 text-2xl font-bold text-[#0a66c2]"><span className="grid h-9 w-9 place-items-center rounded bg-[#0a66c2] text-lg text-white">in</span>TKA Network</NavLink>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-5 pb-16 pt-10 md:grid-cols-2 md:items-center">
        <div className="max-w-lg">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#0a66c2]">Make meaningful connections</p>
          <h1 className="mt-4 text-4xl font-light leading-tight text-gray-800 sm:text-5xl">Your people. Your ideas. Your next opportunity.</h1>
          <p className="mt-5 text-lg leading-7 text-gray-600">Share what you’re learning, follow friends’ updates, and build your professional community.</p>
        </div>
        <section className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-gray-500">Sign in to continue to your network.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">Username, email or mobile
              <input type="text" name="username" placeholder="Enter username, email or mobile" value={form.username} onChange={handleChange} required className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-medium">Password
              <input type="password" name="password" placeholder="Enter password" value={form.password} onChange={handleChange} required className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-[#0a66c2] focus:ring-2 focus:ring-blue-100" />
            </label>
            <div className="text-right"><NavLink to="/forgot" className="text-sm font-semibold text-[#0a66c2] hover:underline">Forgot password?</NavLink></div>
            {errorMessage && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
            <button type="submit" className="w-full rounded-full bg-[#0a66c2] py-3 font-semibold text-white transition hover:bg-[#004182]">Sign in</button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">New to TKA Network? <NavLink to="/signup" className="font-semibold text-[#0a66c2] hover:underline">Join now</NavLink></p>
        </section>
      </main>
    </div>
  );
};

export default Login;
