import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { OrbitMark, Wordmark } from "../components/Logo";
import { MicrosoftIcon } from "../components/icons";
import { signInWithMicrosoft } from "../lib/outlook";
import { ThemeToggle } from "../contexts/ThemeContext";
import "./Auth.css";

interface AuthProps {
  mode: "signin" | "signup";
}

export function Auth({ mode }: AuthProps) {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signup = mode === "signup";

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    const result = signup
      ? await signUp(email, password)
      : await signIn(email, password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (signup) {
      setMessage(
        "Account created. Check your email for a confirmation link, then sign in."
      );
      // Give the message a beat, then land them on sign-in with email kept.
      setTimeout(() => navigate("/signin"), 2200);
    }
  }

  return (
    <div className="auth-page">
      {/* Brand panel */}
      <aside className="auth-brand" aria-hidden>
        <Link to="/" className="auth-brand-logo">
          <Wordmark size={30} />
        </Link>

        <div className="auth-brand-center">
          <OrbitMark size={220} animated />
          <p className="auth-tagline">
            Track<span className="greens-s">s</span> applications.{" "}
            Build<span className="greens-s">s</span> connections.{" "}
            Land<span className="greens-s">s</span> offers.
          </p>
        </div>

        <p className="auth-brand-foot">AI-powered finance career tracker</p>
      </aside>

      {/* Form panel */}
      <main className="auth-form-panel">
        <div className="auth-form-top">
          <Link to="/" className="auth-home-link">
            ← Home
          </Link>
          <ThemeToggle />
        </div>

        <div className="auth-form-wrap">
          {/* The wordmark repeats here for narrow screens where the brand
              panel is hidden. */}
          <Link to="/" className="auth-mobile-brand">
            <Wordmark size={28} />
          </Link>

          <h1 className="auth-title">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="auth-sub">
            {signup
              ? "A few seconds now; a much tidier recruiting season after."
              : "Sign in to pick up your pipeline where you left it."}
          </p>

          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}

          <button
            type="button"
            className="btn btn-ghost oauth-btn"
            onClick={async () => {
              setError(null);
              const { error: err } = await signInWithMicrosoft();
              if (err) setError(err);
            }}
          >
            <MicrosoftIcon size={17} />
            Continue with Microsoft
          </button>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={signup ? "At least 6 characters" : "••••••••"}
                />
                <button
                  type="button"
                  className="password-reveal"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={submitting}
            >
              {submitting
                ? "Please wait…"
                : signup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            {signup ? (
              <>
                Already have an account?{" "}
                <Link to="/signin">Sign in</Link>
              </>
            ) : (
              <>
                New to Offr+? <Link to="/signup">Create an account</Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
