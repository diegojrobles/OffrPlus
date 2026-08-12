import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  connectOutlook,
  disconnectOutlook,
  getOutlookStatus,
  type OutlookStatus,
} from "../lib/outlook";
import {
  CAREER_FOCUSES,
  WORK_TYPES,
  emptyPreferences,
  getPreferences,
  savePreferences,
  type JobPreferences,
} from "../lib/jobs";
import {
  emptyProfile,
  getProfile,
  saveProfile,
  type Profile,
} from "../lib/profile";
import { addBreadcrumb } from "../lib/telemetry";
import { PageHeader } from "../components/PageHeader";
import { MicrosoftIcon } from "../components/icons";
import "./Settings.css";

export function Settings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<OutlookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [prefs, setPrefs] = useState<JobPreferences>(emptyPreferences);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setStatus(await getOutlookStatus(user.id));
    const p = await getPreferences(user.id);
    if (p) setPrefs(p);
    const prof = await getProfile(user.id);
    if (prof) setProfile(prof);
    setLoading(false);
  }, [user]);

  async function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingPrefs(true);
    setPrefsSaved(false);
    const [{ error: profErr }, { error: err }] = await Promise.all([
      saveProfile(user.id, profile),
      savePreferences(user.id, prefs),
    ]);
    setSavingPrefs(false);
    if (profErr) {
      setError(profErr);
      return;
    }
    if (err) setError(err);
    else setPrefsSaved(true);
  }

  useEffect(() => {
    load();
  }, [load]);

  async function handleConnect() {
    addBreadcrumb("action", "outlook.connect_clicked");
    setBusy(true);
    setError(null);
    const { error: err } = await connectOutlook();
    // On success the browser navigates to Microsoft, so this only runs on failure.
    if (err) setError(err);
    setBusy(false);
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect Outlook? Events already in your calendar stay there, but new ones won't sync.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    const { error: err } = await disconnectOutlook();
    if (err) setError(err);
    else await load();
    setBusy(false);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Connected accounts and integrations"
      />

      {error && <div className="error-banner">{error}</div>}

      <section className="card integration-card" style={{ marginBottom: "1rem" }}>
        <div className="section-head">
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
            Your profile
          </h2>
        </div>
        <p className="cell-muted" style={{ margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
          Your name, and what we use to find postings for your dashboard.
        </p>

        <form onSubmit={handleSavePrefs} className="entity-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="set_first">First name</label>
              <input
                id="set_first"
                value={profile.first_name}
                onChange={(e) =>
                  setProfile({ ...profile, first_name: e.target.value })
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="set_last">Last name</label>
              <input
                id="set_last"
                value={profile.last_name}
                onChange={(e) =>
                  setProfile({ ...profile, last_name: e.target.value })
                }
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pref_major">Major</label>
              <input
                id="pref_major"
                value={prefs.major}
                onChange={(e) => setPrefs({ ...prefs, major: e.target.value })}
                placeholder="e.g. Finance"
              />
            </div>
            <div className="form-field">
              <label htmlFor="pref_location">Preferred location</label>
              <input
                id="pref_location"
                value={prefs.location}
                onChange={(e) => setPrefs({ ...prefs, location: e.target.value })}
                placeholder="e.g. New York"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pref_focus">Career focus</label>
              <select
                id="pref_focus"
                value={prefs.career_focus}
                onChange={(e) => setPrefs({ ...prefs, career_focus: e.target.value })}
              >
                <option value="">Choose one</option>
                {CAREER_FOCUSES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="pref_type">Type of role</label>
              <select
                id="pref_type"
                value={prefs.work_type}
                onChange={(e) => setPrefs({ ...prefs, work_type: e.target.value })}
              >
                {WORK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            {prefsSaved && (
              <span className="cell-muted" style={{ marginRight: "auto" }}>
                Saved.
              </span>
            )}
            <button type="submit" className="btn btn-primary" disabled={savingPrefs}>
              {savingPrefs ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>

      <section className="card integration-card">
        <div className="integration-head">
          <div className="integration-id">
            <MicrosoftIcon size={26} />
            <div>
              <h2>Outlook Calendar</h2>
              <p className="cell-muted">
                Push Offr+ events to your Outlook calendar and create Teams
                meetings.
              </p>
            </div>
          </div>

          {loading ? (
            <span className="cell-muted">Checking…</span>
          ) : status?.isConnected ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDisconnect}
              disabled={busy}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={busy}
            >
              {busy ? "Opening Microsoft…" : "Connect Outlook"}
            </button>
          )}
        </div>

        {!loading && status?.isConnected && (
          <div className="integration-status">
            <span className="badge badge-success">Connected</span>
            {status.msEmail && (
              <span className="cell-muted">{status.msEmail}</span>
            )}
          </div>
        )}

        {status?.lastError && (
          <div className="error-banner" style={{ marginTop: "1rem" }}>
            {status.lastError} — reconnect to fix this.
          </div>
        )}

        <div className="help-text" style={{ marginTop: "1rem" }}>
          Teams meetings require a work or school Microsoft account. Personal
          outlook.com accounts can sync calendar events, but Microsoft won't
          create Teams links for them.
        </div>
      </section>
    </div>
  );
}
