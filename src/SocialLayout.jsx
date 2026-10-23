import { NavLink, Outlet } from "react-router-dom";
import Logout from "./Logout";
import NotificationCenter from "./NotificationCenter";

const links = [
  { to: "/dashboard", label: "Home", icon: "⌂" },
  { to: "/people", label: "Discover", icon: "⌕" },
  { to: "/friends", label: "My network", icon: "♧" },
  { to: "/messages", label: "Messages", icon: "✉" },
  { to: "/profile", label: "Profile", icon: "◉" },
];

const SocialLayout = () => (
  <div className="min-h-screen bg-[#f3f2ef] text-[#191919]">
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-2.5">
        <NavLink to="/dashboard" className="flex shrink-0 items-center gap-2 text-xl font-bold tracking-tight text-[#0a66c2]">
          <span className="grid h-8 w-8 place-items-center rounded bg-[#0a66c2] text-white">in</span>
          <span className="hidden sm:inline">TKA Network</span>
        </NavLink>
        <NavLink to="/people" className="hidden max-w-md flex-1 items-center gap-2 rounded-md bg-[#edf3f8] px-3 py-2 text-sm text-gray-600 sm:flex">
          <span className="text-lg">⌕</span> Search people
        </NavLink>
        <nav className="ml-auto flex items-center gap-1 sm:gap-3">
          <NotificationCenter />
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `flex min-w-12 flex-col items-center rounded px-2 py-1 text-[11px] sm:min-w-16 ${isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`text-xl leading-6 ${isActive ? "text-[#0a66c2]" : ""}`}>{link.icon}</span>
                  <span className="hidden sm:inline">{link.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <Logout />
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-7">
      <Outlet />
    </main>
  </div>
);

export default SocialLayout;
