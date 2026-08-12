import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchJobFeed,
  formatSalary,
  postedLabel,
  setJobState,
  type JobPosting,
} from "../lib/jobs";
import { addBreadcrumb } from "../lib/telemetry";
import "./JobFeed.css";

/**
 * New postings matching the user's questionnaire answers.
 *
 * Dismissals are optimistic — the row disappears immediately and the write
 * happens in the background, because waiting on a round trip to hide something
 * you've rejected feels broken.
 */
export function JobFeed() {
  const { user } = useAuth();
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPreferences, setNeedsPreferences] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJobFeed();
    setPostings(result.postings);
    setNote(result.note ?? null);
    setError(result.error ?? null);
    setNeedsPreferences(Boolean(result.needsPreferences));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function dismiss(posting: JobPosting) {
    if (!user) return;
    setPostings((list) => list.filter((p) => p.id !== posting.id));
    addBreadcrumb("action", "job.dismissed");
    await setJobState(user.id, posting.id, "dismissed");
  }

  async function save(posting: JobPosting) {
    if (!user) return;
    setPostings((list) =>
      list.map((p) => (p.id === posting.id ? { ...p, saved: !p.saved } : p)),
    );
    await setJobState(user.id, posting.id, posting.saved ? "applied" : "saved");
  }

  return (
    <section className="job-feed">
      <div className="section-head">
        <h2>New for you</h2>
        {!loading && postings.length > 0 && (
          <button type="button" className="link-btn" onClick={load}>
            Refresh
          </button>
        )}
      </div>

      {loading ? (
        <div className="job-feed-loading">
          <div className="loading-spinner" aria-hidden />
        </div>
      ) : needsPreferences ? (
        <div className="card job-feed-empty">
          <p>Tell us what you're looking for and roles will show up here.</p>
          <Link to="/settings" className="btn btn-primary btn-sm">
            Set preferences
          </Link>
        </div>
      ) : error ? (
        <div className="card job-feed-empty">
          <p>{error}</p>
        </div>
      ) : postings.length === 0 ? (
        <div className="card job-feed-empty">
          <p>
            Nothing new today. We look for postings from the last two weeks
            that match your focus.
          </p>
        </div>
      ) : (
        <>
          {note && <p className="job-feed-note">{note}</p>}
          <ul className="job-list">
            {postings.slice(0, 6).map((p) => {
              const salary = formatSalary(p.salary_min, p.salary_max);
              return (
                <li key={p.id} className="job-card card">
                  <div className="job-card-main">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="job-title"
                    >
                      {p.title}
                    </a>
                    <div className="job-meta">
                      <strong>{p.company || "—"}</strong>
                      {p.location && <span>{p.location}</span>}
                      {salary && <span className="job-salary">{salary}</span>}
                    </div>
                  </div>

                  <div className="job-card-side">
                    <span className="job-posted">
                      {postedLabel(p.posted_at)}
                    </span>
                    <div className="job-actions">
                      <button
                        type="button"
                        className={`btn btn-ghost btn-sm${p.saved ? " job-saved" : ""}`}
                        onClick={() => save(p)}
                        title={p.saved ? "Saved" : "Save this role"}
                      >
                        {p.saved ? "Saved" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => dismiss(p)}
                        title="Not interested"
                        aria-label={`Dismiss ${p.title}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
