import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, isDueSoon, isOverdue, toInputDate } from "../lib/dates";
import type { Contact, ContactInsert } from "../types/database";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

const emptyForm: ContactInsert = {
  name: "",
  email: "",
  phone: "",
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
            {
              key: "name",
              header: "Name",
              render: (c) => <strong>{c.name}</strong>,
            },
            {
              key: "email",
              header: "Email",
              render: (c) =>
                c.email ? (
                  <a className="cell-muted" href={`mailto:${c.email}`}>
                    {c.email}
                  </a>
                ) : (
                  <span className="cell-muted">—</span>
                ),
            },
            {
              key: "phone",
              header: "Phone",
              render: (c) =>
                c.phone ? (
                  <a className="cell-muted" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
                    {c.phone}
                  </a>
                ) : (
                  <span className="cell-muted">—</span>
                ),
            },
            {
              key: "company",
              header: "Company",
              render: (c) => c.company || "—",
            },
            {
              key: "role",
              header: "Role",
              render: (c) => (
                <span className="cell-muted">{c.role || "—"}</span>
              ),
            },
            {
              key: "date_met",
              header: "Date met",
              render: (c) => (
                <span className="cell-muted">{formatDate(c.date_met)}</span>
              ),
            },
            {
              key: "follow_up",
              header: "Follow up",
              render: (c) => (
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
              key: "notes",
              header: "Notes",
              className: "cell-notes",
              render: (c) => c.notes || "—",
            },
            {
              key: "actions",
              header: "",
              className: "cell-actions",
              render: (c) => (
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
