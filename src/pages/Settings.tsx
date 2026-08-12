import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  connectOutlook,
  disconnectOutlook,
  getOutlookStatus,
  type OutlookStatus,
} from "../lib/outlook";
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

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setStatus(await getOutlookStatus(user.id));
    setLoading(false);
  }, [user]);

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
