import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, toInputDate } from "../lib/dates";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationInsert,
  type ApplicationStatus,
  type Contact,
} from "../types/database";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

const emptyForm: ApplicationInsert = {
  company: "",
  role: "",
  status: "Applied",
  date_applied: null,
  notes: "",
};

function statusBadgeClass(status: ApplicationStatus): string {
  switch (status) {
    case "Offer":
      return "badge badge-success";
    case "Rejected":
    case "Withdrawn":
      return "badge badge-danger";
    case "Superday":
    case "Phone Screen":
      return "badge badge-warning";
    default:
      return "badge badge-accent";
  }
}

export function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [form, setForm] = useState<ApplicationInsert>(emptyForm);
  const [linkedContactIds, setLinkedContactIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [appsRes, contactsRes] = await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id)
        .order("date_applied", { ascending: false, nullsFirst: false }),
      supabase.from("contacts").select("*").eq("user_id", user.id).order("name"),
    ]);

    if (appsRes.error) setError(appsRes.error.message);
    else setApplications((appsRes.data as Application[]) ?? []);

    if (contactsRes.error) setError(contactsRes.error.message);
    else setContacts((contactsRes.data as Contact[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setLinkedContactIds([]);
    setModalOpen(true);
  }

  async function openEdit(app: Application) {
    setEditing(app);
    setForm({
      company: app.company,
      role: app.role,
      status: app.status,
      date_applied: app.date_applied,
      notes: app.notes,
    });
    if (user) {
      const { data } = await supabase
        .from("application_contacts")
        .select("contact_id")
        .eq("user_id", user.id)
        .eq("application_id", app.id);
      setLinkedContactIds(
        (data ?? []).map((row: { contact_id: string }) => row.contact_id)
      );
    } else {
      setLinkedContactIds([]);
    }
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setLinkedContactIds([]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const row = {
      ...form,
      date_applied: form.date_applied || null,
    };

    const syncLinks = async (applicationId: string) => {
      const { error: delErr } = await supabase
        .from("application_contacts")
        .delete()
        .eq("user_id", user.id)
        .eq("application_id", applicationId);
      if (delErr) return delErr;

      if (linkedContactIds.length === 0) return null;

      const { error: insErr } = await supabase.from("application_contacts").insert(
        linkedContactIds.map((contactId) => ({
          user_id: user.id,
          application_id: applicationId,
          contact_id: contactId,
        }))
      );
      return insErr;
    };

    if (editing) {
      const { error: err } = await supabase
        .from("applications")
        .update(row)
        .eq("id", editing.id)
        .eq("user_id", user.id);
      if (err) setError(err.message);
      else {
        const linkErr = await syncLinks(editing.id);
        if (linkErr) setError(linkErr.message);
        closeModal();
        load();
      }
    } else {
      const { data, error: err } = await supabase
        .from("applications")
        .insert({ ...row, user_id: user.id })
        .select("id")
        .single();
      if (err) setError(err.message);
      else {
        const linkErr = await syncLinks((data as { id: string }).id);
        if (linkErr) setError(linkErr.message);
        closeModal();
        load();
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!user || !confirm("Delete this application?")) return;
    const { error: err } = await supabase
      .from("applications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (err) setError(err.message);
    else load();
  }

  const filtered = applications.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      a.company.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.status.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle="Track recruiting pipeline and application status"
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add application
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search company, role, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search applications"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner" aria-hidden />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <p>
            {search || statusFilter !== "all"
              ? "No applications match your filters."
              : "No applications yet."}
          </p>
          {!search && statusFilter === "all" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openCreate}
            >
              Add your first application
            </button>
          )}
        </div>
      ) : (
        <DataTable
          data={filtered}
          keyFn={(a) => a.id}
          columns={[
            {
              key: "company",
              header: "Company",
              render: (a) => <strong>{a.company}</strong>,
            },
            {
              key: "role",
              header: "Role",
              render: (a) => a.role,
            },
            {
              key: "status",
              header: "Status",
              render: (a) => (
                <span className={statusBadgeClass(a.status)}>{a.status}</span>
              ),
            },
            {
              key: "date_applied",
              header: "Date applied",
              render: (a) => (
                <span className="cell-muted">{formatDate(a.date_applied)}</span>
              ),
            },
            {
              key: "notes",
              header: "Notes",
              className: "cell-notes",
              render: (a) => a.notes || "—",
            },
            {
              key: "actions",
              header: "",
              className: "cell-actions",
              render: (a) => (
                <div className="actions-group" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEdit(a)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(a.id)}
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
          title={editing ? "Edit application" : "Add application"}
          onClose={closeModal}
        >
          <form onSubmit={handleSubmit} className="entity-form">
            <div className="form-field">
              <label htmlFor="contacts">Contacts</label>
              <select
                id="contacts"
                multiple
                value={linkedContactIds}
                onChange={(e) =>
                  setLinkedContactIds(
                    Array.from(e.target.selectedOptions).map((o) => o.value)
                  )
                }
                aria-label="Link contacts"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` — ${c.company}` : ""}
                  </option>
                ))}
              </select>
              <div className="help-text">
                Hold ⌘/Ctrl to select multiple.
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="company">Company *</label>
                <input
                  id="company"
                  required
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="role">Role *</label>
                <input
                  id="role"
                  required
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as ApplicationStatus,
                    })
                  }
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="date_applied">Date applied</label>
                <input
                  id="date_applied"
                  type="date"
                  value={toInputDate(form.date_applied)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      date_applied: e.target.value || null,
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
                {saving ? "Saving…" : editing ? "Save" : "Add application"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
