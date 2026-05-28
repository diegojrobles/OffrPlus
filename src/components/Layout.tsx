import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Layout.css";

function NavIcon({ name }: { name: "calendar" }) {
  if (name === "calendar") {
    return (
      <svg
        className="nav-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        aria-hidden
      >
        <path
          d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return null;
}

type NavItem = {
  to: string;
  label: string;
  end: boolean;
  icon?: "calendar";
};

const nav: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pipeline", label: "Pipeline", end: false },
  { to: "/calendar", label: "Calendar", end: false, icon: "calendar" },
  { to: "/contacts", label: "Contacts", end: false },
  { to: "/applications", label: "Applications", end: false },
  { to: "/resumes", label: "Resumes", end: false },
];

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">O+</span>
          <span className="brand-text">Offr+</span>
        </div>
        <nav className="sidebar-nav">
          {nav.map(({ to, label, end, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-link${isActive ? " nav-link-active" : ""}`
              }
            >
              {icon ? <NavIcon name={icon} /> : null}
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="user-email" title={user?.email ?? ""}>
            {user?.email}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
