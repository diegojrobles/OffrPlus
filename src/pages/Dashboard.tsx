import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, isDueSoon, isOverdue } from "../lib/dates";
import { displayName, getProfile, type Profile } from "../lib/profile";
import type {
  Application,
  CalendarEvent,
  Contact,
  PipelineStage,
} from "../types/database";
import { PageHeader } from "../components/PageHeader";
import { JobFeed } from "../components/JobFeed";
import "./Dashboard.css";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const today = ymd(new Date());
      const [contactsRes, appsRes, eventsRes, stagesRes, profileRes] =
        await Promise.all([
          supabase
            .from("contacts")
            .select("*")
            .eq("user_id", user!.id)
            .order("follow_up_date", { ascending: true, nullsFirst: false }),
          supabase
            .from("applications")
            .select("*")
            .eq("user_id", user!.id)
            .order("updated_at", { ascending: false }),
          supabase
            .from("events")
            .select("*")
            .eq("user_id", user!.id)
            .gte("event_date", today)
            .order("event_date", { ascending: true })
            .limit(5),
          supabase
            .from("pipeline_stages")
            .select("*")
            .eq("user_id", user!.id)
            .order("position", { ascending: true }),
          getProfile(user!.id),
        ]);

      if (contactsRes.data) setContacts(contactsRes.data as Contact[]);
      if (appsRes.data) setApplications(appsRes.data as Application[]);
      if (eventsRes.data) setEvents(eventsRes.data as CalendarEvent[]);
      if (stagesRes.data) setStages(stagesRes.data as PipelineStage[]);
      setProfile(profileRes);
      setLoading(false);
    }

    load();
  }, [user]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = displayName(profile, user?.email);

  const followUps = contacts.filter((c) => c.follow_up_date);
  const overdue = followUps.filter((c) => isOverdue(c.follow_up_date));
  const dueSoon = followUps.filter(
    (c) => !isOverdue(c.follow_up_date) && isDueSoon(c.follow_up_date),
  );
  const needsAction = [...overdue, ...dueSoon];

  const activeApps = applications.filter(
    (a) => !["Rejected", "Withdrawn", "Offer"].includes(a.status),
  );
  const offers = applications.filter((a) => a.status === "Offer");
  const awaitingReply = applications.filter(
    (a) =>
      a.expected_reply_date &&
      isOverdue(a.expected_reply_date) &&
      !["Rejected", "Withdrawn", "Offer"].includes(a.status),
  );

  // ---- last 7 days of activity ----
  const weekAgo = daysAgoIso(7);
  const newContactsThisWeek = contacts.filter(
    (c) => c.created_at >= weekAgo,
  ).length;
  const newAppsThisWeek = applications.filter(
    (a) => a.created_at >= weekAgo,
  ).length;
  const meetingsThisWeek = events.length;

  // ---- pipeline distribution ----
  const stageCounts = stages.map((s) => ({
    name: s.name,
    color: s.color,
    count: contacts.filter((c) => (c.pipeline_stage || "Not Started") === s.name)
      .length,
  }));
  const pipelineTotal = stageCounts.reduce((sum, s) => sum + s.count, 0);
  const engaged = contacts.filter(
    (c) => c.pipeline_stage && c.pipeline_stage !== "Not Started",
  ).length;

  const nothingPending =
    needsAction.length === 0 && events.length === 0 && awaitingReply.length === 0;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${greeting}${name ? `, ${name}` : ""}`}
        subtitle={
          nothingPending
            ? "Nothing needs chasing today."
            : `${needsAction.length + awaitingReply.length} thing${
                needsAction.length + awaitingReply.length === 1 ? "" : "s"
              } could use your attention.`
        }
      />

      {/* ---------- quick actions ---------- */}
      <nav className="quick-actions" aria-label="Quick actions">
        <Link to="/contacts" className="quick-action">
          <span className="quick-action-plus">+</span> Add contact
        </Link>
        <Link to="/applications" className="quick-action">
          <span className="quick-action-plus">+</span> Log application
        </Link>
        <Link to="/calendar" className="quick-action">
          <span className="quick-action-plus">+</span> Schedule meeting
        </Link>
        <Link to="/resumes" className="quick-action">
          <span className="quick-action-plus">+</span> Upload resume
        </Link>
      </nav>

      {/* ---------- 1. what needs doing ---------- */}
      {!nothingPending && (
        <section className="today">
          <div className="today-grid">
            {needsAction.length > 0 && (
              <div className="today-card card">
                <div className="section-head">
                  <h2>
                    Follow up
                    {overdue.length > 0 && (
                      <span className="badge badge-danger today-count">
                        {overdue.length} overdue
                      </span>
                    )}
                  </h2>
                  <Link to="/contacts" className="section-link">
                    All contacts
                  </Link>
                </div>
                <ul className="today-list">
                  {needsAction.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <div className="today-list-main">
                        <span className="today-name">{c.name}</span>
                        <span className="today-sub">
                          {c.company || "—"}
                          {c.role ? ` · ${c.role}` : ""}
                        </span>
                      </div>
                      <span
                        className={
                          isOverdue(c.follow_up_date)
                            ? "badge badge-danger"
                            : "badge badge-warning"
                        }
                      >
                        {formatDate(c.follow_up_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(events.length > 0 || awaitingReply.length > 0) && (
              <div className="today-card card">
                {events.length > 0 && (
                  <>
                    <div className="section-head">
                      <h2>Coming up</h2>
                      <Link to="/calendar" className="section-link">
                        Calendar
                      </Link>
                    </div>
                    <ul className="today-list">
                      {events.map((ev) => (
                        <li key={ev.id}>
                          <div className="today-list-main">
                            <span className="today-name">{ev.title}</span>
                            <span className="today-sub">
                              {formatDate(ev.event_date)}
                            </span>
                          </div>
                          {ev.meeting_link && (
                            <a
                              className="btn btn-ghost btn-sm"
                              href={ev.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Join
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {awaitingReply.length > 0 && (
                  <>
                    <div
                      className={`section-head${events.length > 0 ? " today-subhead" : ""}`}
                    >
                      <h2>Past expected reply</h2>
                      <Link to="/applications" className="section-link">
                        Applications
                      </Link>
                    </div>
                    <ul className="today-list">
                      {awaitingReply.slice(0, 3).map((a) => (
                        <li key={a.id}>
                          <div className="today-list-main">
                            <span className="today-name">{a.company}</span>
                            <span className="today-sub">{a.role}</span>
                          </div>
                          <span className="badge badge-danger">
                            {formatDate(a.expected_reply_date)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- 2. new postings ---------- */}
      <JobFeed />

      {/* ---------- 3. pipeline + momentum ---------- */}
      <section className="insight-grid">
        <div className="card insight-card">
          <div className="section-head">
            <h2>Networking pipeline</h2>
            <Link to="/pipeline" className="section-link">
              Open board
            </Link>
          </div>

          {pipelineTotal === 0 ? (
            <p className="insight-empty">
              Add contacts and drag them across stages to see your pipeline
              take shape.
            </p>
          ) : (
            <>
              {/* Proportional bar: at a glance, how far along the pipeline
                  your relationships actually are. */}
              <div className="stage-bar" role="img" aria-label="Contacts by stage">
                {stageCounts
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <span
                      key={s.name}
                      className="stage-bar-seg"
                      style={{
                        width: `${(s.count / pipelineTotal) * 100}%`,
                        background: s.color,
                      }}
                      title={`${s.name}: ${s.count}`}
                    />
                  ))}
              </div>

              <ul className="stage-legend">
                {stageCounts
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <li key={s.name}>
                      <span
                        className="stage-dot"
                        style={{ background: s.color }}
                        aria-hidden
                      />
                      <span className="stage-legend-name">{s.name}</span>
                      <span className="stage-legend-count">{s.count}</span>
                    </li>
                  ))}
              </ul>

              <p className="insight-foot">
                <strong>{engaged}</strong> of {contacts.length} contacts are
                past “Not Started”.
              </p>
            </>
          )}
        </div>

        <div className="card insight-card">
          <div className="section-head">
            <h2>This week</h2>
          </div>
          <ul className="momentum">
            <li>
              <span className="momentum-value">{newContactsThisWeek}</span>
              <span className="momentum-label">contacts added</span>
            </li>
            <li>
              <span className="momentum-value">{newAppsThisWeek}</span>
              <span className="momentum-label">applications logged</span>
            </li>
            <li>
              <span className="momentum-value">{meetingsThisWeek}</span>
              <span className="momentum-label">meetings scheduled</span>
            </li>
          </ul>
          <p className="insight-foot">
            {newContactsThisWeek + newAppsThisWeek === 0
              ? "Quiet week so far — one outreach email is enough to start."
              : "Keep the pace up; consistency beats intensity in recruiting."}
          </p>
        </div>
      </section>

      {/* ---------- 4. recent activity ---------- */}
      <section className="insight-grid">
        <div className="card insight-card">
          <div className="section-head">
            <h2>Recent applications</h2>
            <Link to="/applications" className="section-link">
              View all
            </Link>
          </div>
          {applications.length === 0 ? (
            <p className="insight-empty">Nothing logged yet.</p>
          ) : (
            <ul className="today-list">
              {applications.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <div className="today-list-main">
                    <span className="today-name">{a.company}</span>
                    <span className="today-sub">{a.role}</span>
                  </div>
                  <span className="badge badge-accent">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card insight-card">
          <div className="section-head">
            <h2>Recently added contacts</h2>
            <Link to="/contacts" className="section-link">
              View all
            </Link>
          </div>
          {contacts.length === 0 ? (
            <p className="insight-empty">No contacts yet.</p>
          ) : (
            <ul className="today-list">
              {[...contacts]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 5)
                .map((c) => (
                  <li key={c.id}>
                    <div className="today-list-main">
                      <span className="today-name">{c.name}</span>
                      <span className="today-sub">
                        {c.company || "—"}
                        {c.role ? ` · ${c.role}` : ""}
                      </span>
                    </div>
                    <span className="badge">
                      {c.pipeline_stage || "Not Started"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- 5. totals, deliberately last ---------- */}
      <section className="stat-strip" aria-label="Your totals">
        <Link to="/contacts" className="stat-chip">
          <span className="stat-chip-value">{contacts.length}</span>
          <span className="stat-chip-label">Contacts</span>
        </Link>
        <Link to="/applications" className="stat-chip">
          <span className="stat-chip-value">{activeApps.length}</span>
          <span className="stat-chip-label">Active applications</span>
        </Link>
        <Link to="/pipeline" className="stat-chip">
          <span className="stat-chip-value">{followUps.length}</span>
          <span className="stat-chip-label">Scheduled follow-ups</span>
        </Link>
        <Link to="/applications" className="stat-chip">
          <span className="stat-chip-value stat-chip-accent">
            {offers.length}
          </span>
          <span className="stat-chip-label">Offers</span>
        </Link>
      </section>
    </div>
  );
}
