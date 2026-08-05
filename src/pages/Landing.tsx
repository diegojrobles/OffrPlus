import { Link } from "react-router-dom";
import { OrbitMark, Wordmark } from "../components/Logo";
import { ThemeToggle } from "../contexts/ThemeContext";
import "./Landing.css";

/** Brand device from the lockup: TRACKs / BUILDs / LANDs with a green s. */
function GreenS({ word }: { word: string }) {
  return (
    <span className="greens-word">
      {word}
      <span className="greens-s">s</span>
    </span>
  );
}

const FEATURES = [
  {
    verb: "TRACK",
    noun: "applications",
    copy: "All your applications here, in one table. Status, salary, locations and more all at your disposal. Tracks your progress with one click, and flags you when updates arrive.",
  },
  {
    verb: "BUILD",
    noun: "connections",
    copy: "A contact book that knows how recruiting works. Drag people across your networking pipeline, from strangers to connections, and let follow-ups land on your calendar automatically.",
  },
  {
    verb: "LAND",
    noun: "offers",
    copy: "Store your resume versions per firm, and let our AI assistant test and analyze your resume before the recruiter does.",
  },
] as const;

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Wordmark size={30} />
        <nav className="landing-nav-actions">
          <ThemeToggle />
          <Link to="/signin" className="btn btn-ghost">
            Sign in
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-kicker">AI-powered finance career tracker</p>
            <h1 className="hero-title">
              <GreenS word="Track" /> applications.
              <br />
              <GreenS word="Build" /> connections.
              <br />
              <GreenS word="Land" /> offers.
            </h1>
            <p className="hero-sub">
              Recruiting for finance is a hundred small follow-ups pretending to
              be one big decision. Offr+ keeps every application, contact, and
              coffee chat on one trajectory — pointed up and to the right.
            </p>
            <div className="hero-cta">
              <Link to="/signup" className="btn btn-primary btn-lg">
                Start tracking — it's free
              </Link>
              <Link to="/signin" className="btn btn-ghost btn-lg">
                I have an account
              </Link>
            </div>
          </div>

          <div className="hero-art" aria-hidden>
            <OrbitMark size={340} animated />
          </div>
        </section>

        <section className="features" aria-label="What Offr+ does">
          {FEATURES.map((f) => (
            <article key={f.verb} className="feature-card card">
              <h2 className="feature-verb">
                {f.verb}
                <span className="greens-s">s</span>{" "}
                <span className="feature-noun">{f.noun}.</span>
              </h2>
              <p>{f.copy}</p>
            </article>
          ))}
        </section>

        <section className="closer">
          <div className="closer-rule" aria-hidden />
          <p className="closer-line">
            Built by finance students, for the season when your inbox is the
            job.
          </p>
          <Link to="/signup" className="btn btn-primary btn-lg">
            Create your account
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <OrbitMark size={22} />
        <span>Offr+ · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
