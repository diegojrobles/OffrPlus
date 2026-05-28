import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { toInputDate } from "../lib/dates";
import type { CalendarEvent, Contact, MeetingPlatform } from "../types/database";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import "./Calendar.css";

async function syncContactFollowUps(userId: string, contacts: Contact[]): Promise<boolean> {
  const { data: existing } = await supabase
    .from("events")
    .select("id, contact_id, event_date")
    .eq("user_id", userId)
    .eq("event_type", "contact_follow_up");

  const byContact = new Map<string, { id: string; event_date: string }>();
  for (const ev of existing ?? []) {
    if (ev.contact_id) byContact.set(ev.contact_id, ev);
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; event_date: string }[] = [];

  for (const c of contacts) {
    if (!c.follow_up_date) continue;
    const ev = byContact.get(c.id);
    if (!ev) {
      toInsert.push({
        user_id: userId,
        contact_id: c.id,
        title: `Follow up: ${c.name}`,
        event_date: c.follow_up_date,
        start_time: null,
        end_time: null,
        notes: "",
        meeting_link: null,
        meeting_platform: null,
        event_type: "contact_follow_up",
      });
    } else if (ev.event_date !== c.follow_up_date) {
      toUpdate.push({ id: ev.id, event_date: c.follow_up_date });
    }
  }

  if (toInsert.length === 0 && toUpdate.length === 0) return false;

  await Promise.all([
    toInsert.length ? supabase.from("events").insert(toInsert) : Promise.resolve(),
    ...toUpdate.map((u) =>
      supabase.from("events").update({ event_date: u.event_date }).eq("id", u.id)
    ),
  ]);

  return true;
}

type ViewMode = "month" | "week";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  return addDays(x, -day);
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function timeLabel(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

function detectPlatform(url: string): MeetingPlatform {
  const u = url.toLowerCase();
  if (u.includes("zoom.us")) return "zoom";
  if (u.includes("teams.microsoft.com")) return "teams";
  if (u.includes("skype.com")) return "skype";
  return null;
}

function VideoIcon({ platform }: { platform: MeetingPlatform }) {
  // Simple inline icons; zoom is green-highlighted via CSS.
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none" };
  if (platform === "teams") {
    return (
      <svg {...common}>
        <path
          d="M8 7h7a3 3 0 0 1 3 3v7H8V7Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M6 9h2v10H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (platform === "skype") {
    return (
      <svg {...common}>
        <path
          d="M12 3a8 8 0 1 0 8 8 4 4 0 0 1-8-8Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M9.5 12.2c.3 1.6 1.9 2.3 3.5 2.3 1.7 0 3-.8 3-2.1 0-2.9-6.2-1.3-6.2-4 0-1.3 1.3-2.1 3-2.1 1.3 0 2.7.5 3.1 1.7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // zoom + default
  return (
    <svg {...common}>
      <path
        d="M4 8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 10l4-2v8l-4-2v-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Calendar() {
  const { user } = useAuth();
  const hasSynced = useRef(false);
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string>(toYmd(new Date()));
  const [formTitle, setFormTitle] = useState("");
  const [formContactId, setFormContactId] = useState<string>("");
  const [formStart, setFormStart] = useState<string>("");
  const [formEnd, setFormEnd] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formLink, setFormLink] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    // Pull enough events for month/week display
    const start =
      view === "month"
        ? toYmd(startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)))
        : toYmd(startOfWeek(anchor));
    const end =
      view === "month"
        ? toYmd(
            addDays(
              startOfWeek(
                new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
              ),
              6
            )
          )
        : toYmd(addDays(startOfWeek(anchor), 6));

    const [contactsRes, eventsRes] = await Promise.all([
      supabase.from("contacts").select("*").eq("user_id", user.id).order("name"),
      supabase
        .from("events")
        .select("*")
        .eq("user_id", user.id)
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true }),
    ]);

    if (contactsRes.error) setError(contactsRes.error.message);
    else setContacts((contactsRes.data as Contact[]) ?? []);

    const loadedContacts = (contactsRes.data as Contact[]) ?? [];

    // On first mount, sync follow-up events for all contacts with follow_up_date
    if (!hasSynced.current) {
      hasSynced.current = true;
      const didSync = await syncContactFollowUps(user.id, loadedContacts);
      if (didSync) {
        const fresh = await supabase
          .from("events")
          .select("*")
          .eq("user_id", user.id)
          .gte("event_date", start)
          .lte("event_date", end)
          .order("event_date", { ascending: true })
          .order("start_time", { ascending: true, nullsFirst: true });
        if (fresh.error) setError(fresh.error.message);
        else setEvents((fresh.data as CalendarEvent[]) ?? []);
        setLoading(false);
        return;
      }
    }

    if (eventsRes.error) setError(eventsRes.error.message);
    else setEvents((eventsRes.data as CalendarEvent[]) ?? []);

    setLoading(false);
  }, [user, anchor, view]);

  useEffect(() => {
    load();
  }, [load]);

  const contactsById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const k = ev.event_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(ev);
    }
    return m;
  }, [events]);

  function openCreate(dateYmd: string) {
    setCreateDate(dateYmd);
    setFormTitle("");
    setFormContactId("");
    setFormStart("");
    setFormEnd("");
    setFormNotes("");
    setFormLink("");
    setCreateOpen(true);
  }

  function openDetail(ev: CalendarEvent) {
    setSelected(ev);
    setDetailOpen(true);
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const meetingLink = formLink.trim() || null;
    const meetingPlatform = meetingLink ? detectPlatform(meetingLink) : null;

    const payload = {
      user_id: user.id,
      contact_id: formContactId || null,
      title: formTitle.trim() || "Event",
      event_date: createDate,
      start_time: formStart ? `${formStart}:00` : null,
      end_time: formEnd ? `${formEnd}:00` : null,
      notes: formNotes,
      meeting_link: meetingLink,
      meeting_platform: meetingPlatform,
      event_type: "manual",
    };

    const { error: err } = await supabase.from("events").insert(payload);
    if (err) setError(err.message);
    else {
      setCreateOpen(false);
      load();
    }
    setSaving(false);
  }

  function prev() {
    if (view === "month") {
      setAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    } else {
      setAnchor((d) => addDays(d, -7));
    }
  }

  function next() {
    if (view === "month") {
      setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    } else {
      setAnchor((d) => addDays(d, 7));
    }
  }

  function today() {
    setAnchor(startOfDay(new Date()));
  }

  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    const cells: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
    return { first, cells };
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div className="calendar-wrap">
      <PageHeader
        title="Calendar"
        subtitle="Follow-ups and meetings in one place"
        action={
          <button type="button" className="btn btn-primary" onClick={() => openCreate(toYmd(new Date()))}>
            New event
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="cal-controls">
        <div className="cal-left">
          <button type="button" className="btn btn-ghost btn-sm" onClick={prev}>
            Prev
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={today}>
            Today
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={next}>
            Next
          </button>
          <span className="cal-title">
            {view === "month" ? monthLabel(anchor) : `Week of ${monthLabel(startOfWeek(anchor))}`}
          </span>
        </div>

        <div className="cal-right">
          <div className="segmented" role="tablist" aria-label="Calendar view">
            <button
              type="button"
              className={view === "month" ? "active" : undefined}
              onClick={() => setView("month")}
              role="tab"
              aria-selected={view === "month"}
            >
              Month
            </button>
            <button
              type="button"
              className={view === "week" ? "active" : undefined}
              onClick={() => setView("week")}
              role="tab"
              aria-selected={view === "week"}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {view === "month" ? (
        <div className="calendar-grid">
          <div className="dow-row">
            {DOW.map((d) => (
              <div key={d} className="dow">
                {d}
              </div>
            ))}
          </div>
          <div className="month-body">
            {monthCells.cells.map((d) => {
              const ymd = toYmd(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const list = eventsByDate.get(ymd) ?? [];
              return (
                <div
                  key={ymd}
                  className={`day-cell${inMonth ? "" : " muted"}`}
                  onClick={() => openCreate(ymd)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openCreate(ymd);
                  }}
                >
                  <div className="day-top">
                    <span className="day-num">{d.getDate()}</span>
                  </div>
                  {list.slice(0, 3).map((ev) => {
                    const c = ev.contact_id ? contactsById.get(ev.contact_id) : null;
                    const platform = ev.meeting_platform ?? null;
                    const time = timeLabel(ev.start_time);
                    return (
                      <div
                        key={ev.id}
                        className="event-pill"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(ev);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openDetail(ev);
                          }
                        }}
                      >
                        <div className="event-text">
                          <div className="event-title">
                            {c ? c.name : ev.title}
                          </div>
                          <div className="event-sub">
                            {c ? `${c.company || "—"}${c.role ? ` • ${c.role}` : ""}` : time}
                            {c && time ? ` • ${time}` : ""}
                          </div>
                        </div>
                        {ev.meeting_link && platform && (
                          <button
                            type="button"
                            className={`video-icon-btn ${platform === "zoom" ? "zoom" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(ev.meeting_link!, "_blank", "noopener,noreferrer");
                            }}
                            aria-label="Join meeting"
                            title="Join meeting"
                          >
                            <VideoIcon platform={platform} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {list.length > 3 && (
                    <div className="event-sub">+{list.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="week-days" role="region" aria-label="Weekly calendar">
          {weekDays.map((d) => {
            const ymd = toYmd(d);
            const list = eventsByDate.get(ymd) ?? [];
            return (
              <div key={ymd} className="week-col" onClick={() => openCreate(ymd)} role="button" tabIndex={0}>
                <div className="week-head">
                  <strong>{DOW[d.getDay()]}</strong>
                  <span>{d.getMonth() + 1}/{d.getDate()}</span>
                </div>
                <div className="event-list">
                  {list.map((ev) => {
                    const c = ev.contact_id ? contactsById.get(ev.contact_id) : null;
                    const platform = ev.meeting_platform ?? null;
                    const time =
                      timeLabel(ev.start_time) +
                      (ev.end_time ? `–${timeLabel(ev.end_time)}` : "");
                    return (
                      <div
                        key={ev.id}
                        className="event-pill"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(ev);
                        }}
                      >
                        <div className="event-text">
                          <div className="event-title">{c ? c.name : ev.title}</div>
                          <div className="event-sub">
                            {c ? `${c.company || "—"}${c.role ? ` • ${c.role}` : ""}` : ""}
                            {time ? ` • ${time}` : ""}
                          </div>
                        </div>
                        {ev.meeting_link && platform && (
                          <button
                            type="button"
                            className={`video-icon-btn ${platform === "zoom" ? "zoom" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(ev.meeting_link!, "_blank", "noopener,noreferrer");
                            }}
                            aria-label="Join meeting"
                            title="Join meeting"
                          >
                            <VideoIcon platform={platform} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {list.length === 0 && <div className="stage-empty">No events.</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <Modal title="Create event" onClose={() => setCreateOpen(false)}>
          <form className="entity-form" onSubmit={createEvent}>
            <div className="form-field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Coffee chat"
              />
            </div>

            <div className="form-field">
              <label htmlFor="contact">Linked contact</label>
              <select
                id="contact"
                value={formContactId}
                onChange={(e) => setFormContactId(e.target.value)}
              >
                <option value="">None</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` — ${c.company}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="link-input-row">
              <div className="form-field">
                <label htmlFor="date">Date</label>
                <input
                  id="date"
                  type="date"
                  value={toInputDate(createDate)}
                  onChange={(e) => setCreateDate(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="start">Start time</label>
                <input
                  id="start"
                  type="time"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="end">End time</label>
                <input
                  id="end"
                  type="time"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="meeting">Meeting link</label>
              <input
                id="meeting"
                value={formLink}
                onChange={(e) => setFormLink(e.target.value)}
                placeholder="Zoom / Teams / Skype URL"
              />
              <div className="help-text">
                Platform is detected automatically (Zoom / Teams / Skype).
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detailOpen && selected && (
        <Modal title="Event details" onClose={() => setDetailOpen(false)}>
          {(() => {
            const c = selected.contact_id ? contactsById.get(selected.contact_id) : null;
            const platform = selected.meeting_platform ?? null;
            const time =
              timeLabel(selected.start_time) +
              (selected.end_time ? `–${timeLabel(selected.end_time)}` : "");
            return (
              <div className="entity-form">
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                        {selected.title}
                      </div>
                      <div className="cell-muted" style={{ marginTop: "0.25rem" }}>
                        {selected.event_date}
                        {time ? ` • ${time}` : ""}
                      </div>
                      {c && (
                        <div className="cell-muted" style={{ marginTop: "0.25rem" }}>
                          {c.name} — {c.company || "—"}
                          {c.role ? ` • ${c.role}` : ""}
                        </div>
                      )}
                    </div>
                    {selected.meeting_link && platform && (
                      <button
                        type="button"
                        className={`video-icon-btn ${platform === "zoom" ? "zoom" : ""}`}
                        onClick={() =>
                          window.open(selected.meeting_link!, "_blank", "noopener,noreferrer")
                        }
                        aria-label="Join meeting"
                        title="Join meeting"
                      >
                        <VideoIcon platform={platform} />
                      </button>
                    )}
                  </div>
                </div>

                {selected.notes && (
                  <div className="card">
                    <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Notes</div>
                    <div className="cell-muted" style={{ whiteSpace: "pre-wrap" }}>
                      {selected.notes}
                    </div>
                  </div>
                )}

                {selected.meeting_link && (
                  <button
                    type="button"
                    className="btn btn-primary join-btn"
                    onClick={() =>
                      window.open(selected.meeting_link!, "_blank", "noopener,noreferrer")
                    }
                  >
                    Join Meeting
                  </button>
                )}
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

