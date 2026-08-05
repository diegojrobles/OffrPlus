import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, isDueSoon, isOverdue } from "../lib/dates";
import type { Application, Contact } from "../types/database";
import { PageHeader } from "../components/PageHeader";
import "./Dashboard.css";

export function Dashboard() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const [contactsRes, appsRes] = await Promise.all([
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
      ]);

      if (contactsRes.data) setContacts(contactsRes.data as Contact[]);
      if (appsRes.data) setApplications(appsRes.data as Application[]);
      setLoading(false);
    }

    load();
  }, [user]);

  const followUps = contacts.filter((c) => c.follow_up_date);
  const overdueFollowUps = followUps.filter((c) =>
    isOverdue(c.follow_up_date)
  );

  const activeApps = applications.filter(
    (a) => !["Rejected", "Withdrawn", "Offer"].includes(a.status)
  );
  const offers = applications.filter((a) => a.status === "Offer");

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden />
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.email?.split("@")[0] ?? "";

  return (
    <div>
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        subtitle="Your networking and recruiting at a glance"
      />

      <div className="stats-grid">
        <div className="stat-card card">
          <span className="stat-value">{contacts.length}</span>
          <span className="stat-label">Contacts</span>
        </div>
        <div className="stat-card card">
          <span className="stat-value">{activeApps.length}</span>
          <span className="stat-label">Active applications</span>
        </div>
        <div className="stat-card card">
          <span className="stat-value">{overdueFollowUps.length}</span>
          <span className="stat-label">Overdue follow-ups</span>
        </div>
        <div className="stat-card card">
          <span className="stat-value">{offers.length}</span>
          <span className="stat-label">Offers</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-section card">
          <div className="section-head">
            <h2>Follow-ups</h2>
            <Link to="/contacts" className="section-link">
              View all
            </Link>
          </div>
          {followUps.length === 0 ? (
            <p className="section-empty">No follow-ups scheduled.</p>
          ) : (
            <ul className="mini-list">
              {[...followUps]
                .sort((a, b) =>
                  (a.follow_up_date ?? "").localeCompare(
                    b.follow_up_date ?? ""
                  )
                )
                .slice(0, 5)
                .map((c) => (
                  <li key={c.id}>
                    <span className="mini-list-primary">{c.name}</span>
                    <span className="mini-list-secondary">{c.company}</span>
                    <span
                      className={`mini-list-date${
                        isOverdue(c.follow_up_date)
                          ? " date-overdue"
                          : isDueSoon(c.follow_up_date)
                            ? " date-soon"
                            : ""
                      }`}
                    >
                      {formatDate(c.follow_up_date)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="dashboard-section card">
          <div className="section-head">
            <h2>Recent applications</h2>
            <Link to="/applications" className="section-link">
              View all
            </Link>
          </div>
          {applications.length === 0 ? (
            <p className="section-empty">No applications yet.</p>
          ) : (
            <ul className="mini-list">
              {applications.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <span className="mini-list-primary">{a.company}</span>
                  <span className="mini-list-secondary">{a.role}</span>
                  <span className="badge badge-accent">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
