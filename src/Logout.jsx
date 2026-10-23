
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const Logout = () => {
  const navigateMe = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Logout failed: " + error.message);
      return;
    }

    localStorage.removeItem("loginStatus");
    localStorage.removeItem("userdetail");

    navigateMe("/", { replace: true });
  };

  return (
    <button
      onClick={handleLogout}
      className="ml-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
    >
      <span className="hidden sm:inline">Sign out</span>
      <span className="sm:hidden">Exit</span>
    </button>
  );
};

export default Logout;
