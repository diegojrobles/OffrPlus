import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  CAREER_FOCUSES,
  WORK_TYPES,
  emptyPreferences,
  savePreferences,
  type JobPreferences,
} from "../lib/jobs";
import { emptyProfile, getProfile, saveProfile, type Profile } from "../lib/profile";
import { OrbitMark } from "../components/Logo";
import { addBreadcrumb } from "../lib/telemetry";
import "./Onboarding.css";

/**
 * Shown once, after the first sign-in. Three short steps rather than one long
 * form — each screen asks one thing, which reads faster and makes the progress
 * obvious.
 */

const STEPS = ["About you", "What you're after", "Where"] as const;

export function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<JobPreferences>(emptyPreferences);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  // OAuth sign-ups already have a name from the provider — pre-fill it so
  // they aren't asked to retype what Microsoft just told us.
  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then((p) => {
      if (p && (p.first_name || p.last_name)) setProfile(p);
    });
  }, [user]);

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    // Not the last step yet — advance instead of saving.
    if (step < STEPS.length - 1) {
      next();
      return;
    }

    setSaving(true);
    setError(null);
    addBreadcrumb("action", "onboarding.completed");

    const [{ error: profileErr }, { error: err }] = await Promise.all([
      saveProfile(user.id, profile),
      savePreferences(user.id, prefs, true),
    ]);
    setSaving(false);

    if (profileErr) {
      setError(profileErr);
      return;
    }

    if (err) {
      setError(err);
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  const canAdvance =
    step === 0
      ? prefs.major.trim().length > 0 && profile.first_name.trim().length > 0
      : step === 1
        ? prefs.career_focus.length > 0
        : true;

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <OrbitMark size={52} />

        <div className="onboarding-progress" aria-hidden>
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`onboarding-dot${i <= step ? " is-done" : ""}`}
            />
          ))}
        </div>

        <p className="onboarding-step-label">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="entity-form">
          {step === 0 && (
            <>
              <h1>First, who are you?</h1>
              <p className="onboarding-lede">
                This shapes the roles we surface on your dashboard. You can
                change any of it later in Settings.
              </p>

              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="first_name">First name *</label>
                  <input
                    id="first_name"
                    required
                    autoFocus
                    value={profile.first_name}
                    onChange={(e) =>
                      setProfile({ ...profile, first_name: e.target.value })
                    }
                    placeholder="Diego"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="last_name">Last name</label>
                  <input
                    id="last_name"
                    value={profile.last_name}
                    onChange={(e) =>
                      setProfile({ ...profile, last_name: e.target.value })
                    }
                    placeholder="Robles"
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="major">What are you studying? *</label>
                <input
                  id="major"
                  required
                  value={prefs.major}
                  onChange={(e) =>
                    setPrefs({ ...prefs, major: e.target.value })
                  }
                  placeholder="e.g. Finance, Economics, Accounting"
                />
              </div>

              <div className="form-field">
                <label htmlFor="grad_year">Graduation year</label>
                <select
                  id="grad_year"
                  value={prefs.graduation_year ?? ""}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      graduation_year: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Prefer not to say</option>
                  {[0, 1, 2, 3, 4].map((offset) => (
                    <option key={offset} value={currentYear + offset}>
                      {currentYear + offset}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>What are you targeting?</h1>
              <p className="onboarding-lede">
                Pick the closest fit — it's the biggest lever on which postings
                you see.
              </p>

              <div className="form-field">
                <label>Career focus *</label>
                <div className="choice-grid">
                  {CAREER_FOCUSES.map((focus) => (
                    <button
                      key={focus}
                      type="button"
                      className={`choice${prefs.career_focus === focus ? " is-selected" : ""}`}
                      onClick={() =>
                        setPrefs({ ...prefs, career_focus: focus })
                      }
                      aria-pressed={prefs.career_focus === focus}
                    >
                      {focus}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <label>Type of role</label>
                <div className="choice-grid choice-grid-wide">
                  {WORK_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`choice${prefs.work_type === t.value ? " is-selected" : ""}`}
                      onClick={() =>
                        setPrefs({ ...prefs, work_type: t.value })
                      }
                      aria-pressed={prefs.work_type === t.value}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Where do you want to work?</h1>
              <p className="onboarding-lede">
                A city or region. Leave it blank to see roles anywhere.
              </p>

              <div className="form-field">
                <label htmlFor="location">Preferred location</label>
                <input
                  id="location"
                  autoFocus
                  value={prefs.location}
                  onChange={(e) =>
                    setPrefs({ ...prefs, location: e.target.value })
                  }
                  placeholder="e.g. New York, Chicago, London"
                />
                <div className="help-text">
                  We search recent postings that match — nothing is shared with
                  employers.
                </div>
              </div>
            </>
          )}

          <div className="form-actions onboarding-actions">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={back}>
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canAdvance || saving}
            >
              {saving
                ? "Setting up…"
                : step === STEPS.length - 1
                  ? "Finish"
                  : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
