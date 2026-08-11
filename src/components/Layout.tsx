import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ThemeToggle } from "../contexts/ThemeContext";
import { Wordmark } from "./Logo";
import "./Layout.css";

type IconName =
  | "grid"
  | "columns"
  | "calendar"
  | "folder"
  | "user"
  | "briefcase"
  | "document"
  | "chevron-down"
  | "chevron-up"
  | "settings";

function NavIcon({ name }: { name: IconName }) {
  const common = {
    className: "nav-icon",
    viewBox: "0 0 24 24",
    width: "16",
    height: "16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "columns":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="4" height="18" rx="1" />
          <rect x="10" y="3" width="4" height="12" rx="1" />
          <rect x="17" y="3" width="4" height="16" rx="1" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <path d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );
    case "chevron-up":
      return (
        <svg {...common}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      );
    default:
      return null;
  }
}

export function Layout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const [myOffrExpanded, setMyOffrExpanded] = useState(true);

  const myOffrActive = ["/contacts", "/applications", "/resumes"].some((p) =>
    pathname.startsWith(p)
  );

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " nav-link-active" : ""}`;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Wordmark size={26} />
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={navLinkClass}>
            <NavIcon name="grid" />
            Dashboard
          </NavLink>
          <NavLink to="/pipeline" className={navLinkClass}>
            <NavIcon name="columns" />
            Pipeline
          </NavLink>
          <NavLink to="/calendar" className={navLinkClass}>
            <NavIcon name="calendar" />
            Calendar
          </NavLink>

          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle${myOffrActive ? " nav-group-toggle-active" : ""}`}
              onClick={() => setMyOffrExpanded((v) => !v)}
              aria-expanded={myOffrExpanded}
            >
              <NavIcon name="folder" />
              <span className="nav-group-label">My Offr+</span>
              <NavIcon name={myOffrExpanded ? "chevron-up" : "chevron-down"} />
            </button>

            {myOffrExpanded && (
              <div className="nav-group-items">
                <NavLink to="/contacts" className={navLinkClass}>
                  <NavIcon name="user" />
                  Contacts
                </NavLink>
                <NavLink to="/applications" className={navLinkClass}>
                  <NavIcon name="briefcase" />
                  Applications
                </NavLink>
                <NavLink to="/resumes" className={navLinkClass}>
                  <NavIcon name="document" />
                  Resumes
                </NavLink>
              </div>
            )}
          </div>

          <NavLink to="/settings" className={navLinkClass}>
            <NavIcon name="settings" />
            Settings
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-email" title={user?.email ?? ""}>
            {user?.email}
          </span>
          <div className="sidebar-footer-actions">
            <ThemeToggle />
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
