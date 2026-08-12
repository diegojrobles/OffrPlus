import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { displayName, getProfile, type Profile } from "../lib/profile";
import { OrbitMark, Wordmark } from "../components/Logo";
import { ThemeToggle } from "../contexts/ThemeContext";
import "./Welcome.css";

/**
 * The signed-in counterpart to the public landing page.
 *
 * Same brand moment, but nothing here asks you to sign in or create an
 * account — you already did. The three pillars become doors into the app
 * instead of sales copy.
 */

const DESTINATIONS = [
  {
    verb: "TRACK",
    noun: "applications",
    to: "/applications",
    blurb: "Every role you've applied to, with status, salary and reply dates.",
  },
  {
    verb: "BUILD",
    noun: "connections",
    to: "/pipeline",
    blurb: "Move contacts across your networking pipeline as conversations progress.",
  },
  {
    verb: "LAND",
    noun: "offers",
    to: "/resumes",
    blurb: "Resume versions stored per firm, ready to tailor and send.",
  },
] as const;

export function Welcome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (user) getProfile(user.id).then(setProfile);
  }, [user]);

  const firstName = displayName(profile, user?.email);

  return (
    <div className="welcome">
      <header className="welcome-nav">
        <Link to="/dashboard" aria-label="Offr+ dashboard">
          <Wordmark size={30} />
        </Link>
        <nav className="welcome-nav-actions">
          <ThemeToggle />
          <Link to="/dashboard" className="btn btn-primary">
            Back to app
          </Link>
        </nav>
      </header>

      <main className="welcome-main">
        <section className="welcome-hero">
          <OrbitMark size={140} animated />
          <div>
            <h1>
              Welcome back{firstName ? <>, {firstName}</> : ""}.
            </h1>
            <p>
              Your pipeline is where you left it. Pick up wherever the next
              conversation is.
            </p>
            <Link to="/dashboard" className="btn btn-primary btn-lg">
              Go to your dashboard
            </Link>
          </div>
        </section>

        <section className="welcome-grid" aria-label="Jump into Offr+">
          {DESTINATIONS.map((d) => (
            <Link key={d.verb} to={d.to} className="welcome-card card">
              <h2>
                {d.verb}
                <span className="greens-s">s</span>{" "}
                <span className="welcome-card-noun">{d.noun}</span>
              </h2>
              <p>{d.blurb}</p>
              <span className="welcome-card-go" aria-hidden>
                Open →
              </span>
            </Link>
          ))}
        </section>
      </main>

      <footer className="welcome-footer">
        <OrbitMark size={20} />
        <span>Offr+ · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
