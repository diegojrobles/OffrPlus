import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, isDueSoon, isOverdue, toInputDate } from "../lib/dates";
import { useColumnPrefs } from "../lib/columnPrefs";
import type { Contact, ContactInsert } from "../types/database";
import { DataTable } from "../components/DataTable";
import { ColumnPicker, type ColumnOption } from "../components/ColumnPicker";
import { LinkedInIcon } from "../components/icons";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

/**
 * Accepts anything a user is likely to paste — a full URL, "linkedin.com/in/x",
 * or just "in/x" — and returns a clickable https URL (or "" if blank).
 */
function normalizeLinkedInUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("linkedin.com") || v.startsWith("www.linkedin.com"))
    return `https://${v}`;
  if (v.startsWith("in/")) return `https://www.linkedin.com/${v}`;
  return `https://${v}`;
}

const COLUMN_PREFS_KEY = "offrplus.contacts.hiddenColumns";

const emptyForm: ContactInsert = {
  name: "",
  email: "",
  phone: "",
  linkedin_url: "",
  company: "",
  role: "",
  date_met: null,
  follow_up_date: null,
  pipeline_stage: "Not Started",
  notes: "",
};

export function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactInsert>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { isVisible, toggle, showAll, hiddenCount } = useColumnPrefs(COLUMN_PREFS_KEY);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    if (err) setError(err.message);
    else setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      email: contact.email,
      phone: contact.phone ?? "",
      linkedin_url: contact.linkedin_url ?? "",
      company: contact.company,
      role: contact.role,
      date_met: contact.date_met,
      follow_up_date: contact.follow_up_date,
      pipeline_stage: contact.pipeline_stage ?? "Not Started",
      notes: contact.notes,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const row = {
      ...form,
      linkedin_url: normalizeLinkedInUrl(form.linkedin_url),
      date_met: form.date_met || null,
      follow_up_date: form.follow_up_date || null,
    };

    if (editing) {
      const { error: err } = await supabase
        .from("contacts")
        .update(row)
        .eq("id", editing.id)
        .eq("user_id", user.id);
      if (err) setError(err.message);
      else {
        closeModal();
        load();
      }
    } else {
      const { error: err } = await supabase
        .from("contacts")
        .insert({ ...row, user_id: user.id });
      if (err) setError(err.message);
      else {
        closeModal();
        load();
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!user || !confirm("Delete this contact?")) return;
    const { error: err } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (err) setError(err.message);
    else load();
  }

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q)
    );
  });

  const columnOptions: ColumnOption[] = useMemo(
    () => [
      { id: "name", label: "Name", locked: true },
      { id: "email", label: "Email" },
      { id: "phone", label: "Phone" },
      { id: "linkedin", label: "LinkedIn" },
      { id: "company", label: "Company" },
      { id: "role", label: "Role" },
      { id: "date_met", label: "Date met" },
      { id: "follow_up", label: "Follow up" },
      { id: "notes", label: "Notes" },
    ],
    []
  );

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Track networking relationships and follow-ups"
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add contact
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, email, phone, company, role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search contacts"
        />
        <ColumnPicker
          options={columnOptions}
          isVisible={isVisible}
          onToggle={toggle}
          onShowAll={showAll}
          hiddenCount={hiddenCount}
        />
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner" aria-hidden />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <p>{search ? "No contacts match your search." : "No contacts yet."}</p>
          {!search && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add your first contact
            </button>
          )}
        </div>
      ) : (
        <DataTable
          data={filtered}
          keyFn={(c) => c.id}
          columns={[
            ...[
            {
              id: "name",
              key: "name",
              header: "Name",
              render: (c: Contact) => <strong>{c.name}</strong>,
            },
            {
              id: "email",
              key: "email",
              header: "Email",
              render: (c: Contact) =>
                c.email ? (
                  <a className="cell-muted" href={`mailto:${c.email}`}>
                    {c.email}
                  </a>
                ) : (
                  <span className="cell-muted">—</span>
                ),
            },
            {
              id: "phone",
              key: "phone",
              header: "Phone",
              render: (c: Contact) =>
                c.phone ? (
                  <a className="cell-muted" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
                    {c.phone}
                  </a>
                ) : (
                  <span className="cell-muted">—</span>
                ),
            },
            {
              id: "linkedin",
              key: "linkedin",
              header: "LinkedIn",
              render: (c: Contact) =>
                c.linkedin_url ? (
                  <a
                    className="linkedin-link"
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.linkedin_url}
                    aria-label={`${c.name} on LinkedIn`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <LinkedInIcon />
                  </a>
                ) : (
                  <span className="cell-muted">—</span>
                ),
            },
            {
              id: "company",
              key: "company",
              header: "Company",
              render: (c: Contact) => c.company || "—",
            },
            {
              id: "role",
              key: "role",
              header: "Role",
              render: (c: Contact) => (
                <span className="cell-muted">{c.role || "—"}</span>
              ),
            },
            {
              id: "date_met",
              key: "date_met",
              header: "Date met",
              render: (c: Contact) => (
                <span className="cell-muted">{formatDate(c.date_met)}</span>
              ),
            },
            {
              id: "follow_up",
              key: "follow_up",
              header: "Follow up",
              render: (c: Contact) => (
                <span
                  className={
                    isOverdue(c.follow_up_date)
                      ? "badge badge-danger"
                      : isDueSoon(c.follow_up_date)
                        ? "badge badge-warning"
                        : "cell-muted"
                  }
                >
                  {formatDate(c.follow_up_date)}
                </span>
              ),
            },
            {
              id: "notes",
              key: "notes",
              header: "Notes",
              className: "cell-notes",
              render: (c: Contact) => c.notes || "—",
            },
            ].filter((col) => col.id === "name" || isVisible(col.id)),
            {
              key: "actions",
              header: "",
              className: "cell-actions",
              render: (c: Contact) => (
                <div className="actions-group" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEdit(c)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(c.id)}
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {modalOpen && (
        <Modal
          title={editing ? "Edit contact" : "Add contact"}
          onClose={closeModal}
        >
          <form onSubmit={handleSubmit} className="entity-form">
            <div className="form-field">
              <label htmlFor="name">Name *</label>
              <input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@company.com"
                />
              </div>
              <div className="form-field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="linkedin_url">LinkedIn</label>
              <input
                id="linkedin_url"
                value={form.linkedin_url}
                onChange={(e) =>
                  setForm({ ...form, linkedin_url: e.target.value })
                }
                placeholder="linkedin.com/in/their-profile"
              />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="company">Company</label>
                <input
                  id="company"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="role">Role</label>
                <input
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="date_met">Date met</label>
                <input
                  id="date_met"
                  type="date"
                  value={toInputDate(form.date_met)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      date_met: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="follow_up_date">Follow up</label>
                <input
                  id="follow_up_date"
                  type="date"
                  value={toInputDate(form.follow_up_date)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      follow_up_date: e.target.value || null,
                    })
                  }
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? "Saving…" : editing ? "Save" : "Add contact"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
