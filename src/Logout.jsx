
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
    <button onClick={handleLogout}>
      Logout
    </button>
  );
};

export default Logout;
