import { Link, useLocation } from "react-router-dom";
import "./Breadcrumbs.css";

interface Crumb {
  label: string;
  /** Omitted for grouping crumbs that have no page of their own. */
  to?: string;
}

/**
 * The app is shallow — most pages sit one level below the dashboard — so the
 * trail exists mainly to name the section a page belongs to. "My Offr+" is a
 * sidebar grouping rather than a route, so it renders as plain text.
 */
const TRAILS: Record<string, Crumb[]> = {
  "/dashboard": [{ label: "Dashboard" }],
  "/pipeline": [{ label: "Dashboard", to: "/dashboard" }, { label: "Pipeline" }],
  "/calendar": [{ label: "Dashboard", to: "/dashboard" }, { label: "Calendar" }],
  "/settings": [{ label: "Dashboard", to: "/dashboard" }, { label: "Settings" }],
  "/contacts": [
    { label: "Dashboard", to: "/dashboard" },
    { label: "My Offr+" },
    { label: "Contacts" },
  ],
  "/applications": [
    { label: "Dashboard", to: "/dashboard" },
    { label: "My Offr+" },
    { label: "Applications" },
  ],
  "/resumes": [
    { label: "Dashboard", to: "/dashboard" },
    { label: "My Offr+" },
    { label: "Resumes" },
  ],
};

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const trail = TRAILS[pathname];

  // Nothing useful to show on the dashboard itself, or on an unmapped route.
  if (!trail || trail.length < 2) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={crumb.label}>
              {crumb.to && !isLast ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <span className="breadcrumb-sep" aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
