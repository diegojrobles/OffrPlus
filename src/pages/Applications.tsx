import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, isDueSoon, isOverdue, toInputDate } from "../lib/dates";
import { useColumnPrefs } from "../lib/columnPrefs";
import {
  APPLICATION_STATUSES,
  CUSTOM_FIELD_TYPES,
  type AppCustomField,
  type Application,
  type ApplicationInsert,
  type ApplicationStatus,
  type Contact,
  type CustomFieldType,
} from "../types/database";
import { DataTable } from "../components/DataTable";
import { ColumnPicker, type ColumnOption } from "../components/ColumnPicker";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

const emptyForm: ApplicationInsert = {
  company: "",
  role: "",
  status: "Applied",
  date_applied: null,
  salary: "",
  expected_reply_date: null,
  location: "",
  link: "",
  custom_fields: {},
  notes: "",
};

const COLUMN_PREFS_KEY = "offrplus.applications.hiddenColumns";

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

/** Strips protocol/www so long URLs stay readable in a table cell. */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

function withProtocol(url: string): string {
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

/**
 * Status badge that doubles as a picker. Looks exactly like the old static
 * badge until you hover it, at which point a chevron fades in. The space
 * for the chevron is reserved at all times so the column doesn't jump.
 */
function StatusSelect({
  value,
  onChange,
}: {
  value: ApplicationStatus;
  onChange: (next: ApplicationStatus) => void;
}) {
  return (
    <span
      className={`status-pill ${statusBadgeClass(value)}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* The visible label is plain text, exactly as the old badge was, so
          the pill keeps its natural width. A <select> sizes itself to its
          widest option, which would make every badge "Phone Screen" wide —
          hence the transparent overlay below instead. */}
      {value}
      <select
        className="status-select"
        value={value}
        aria-label="Status"
        onChange={(e) => onChange(e.target.value as ApplicationStatus)}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </span>
  );
}

export function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<AppCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [form, setForm] = useState<ApplicationInsert>(emptyForm);
  const [linkedContactIds, setLinkedContactIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");
  const [savingField, setSavingField] = useState(false);

  const { isVisible, toggle, showAll, hiddenCount } = useColumnPrefs(COLUMN_PREFS_KEY);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [appsRes, contactsRes, fieldsRes] = await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id)
        .order("date_applied", { ascending: false, nullsFirst: false }),
      supabase.from("contacts").select("*").eq("user_id", user.id).order("name"),
      supabase
        .from("app_custom_fields")
        .select("*")
        .eq("user_id", user.id)
        .order("position", { ascending: true }),
    ]);

    if (appsRes.error) setError(appsRes.error.message);
    else setApplications((appsRes.data as Application[]) ?? []);

    if (contactsRes.error) setError(contactsRes.error.message);
    else setContacts((contactsRes.data as Contact[]) ?? []);

    if (fieldsRes.error) setError(fieldsRes.error.message);
    else setCustomFields((fieldsRes.data as AppCustomField[]) ?? []);

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
      salary: app.salary ?? "",
      expected_reply_date: app.expected_reply_date,
      location: app.location ?? "",
      link: app.link ?? "",
      custom_fields: app.custom_fields ?? {},
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

  function setCustomValue(fieldId: string, value: string) {
    setForm((prev) => ({
      ...prev,
      custom_fields: { ...prev.custom_fields, [fieldId]: value },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    // Drop blank values so the JSON column doesn't accumulate empty keys.
    const cleanedCustom = Object.fromEntries(
      Object.entries(form.custom_fields ?? {}).filter(([, v]) => v !== "")
    );

    const row = {
      ...form,
      date_applied: form.date_applied || null,
      expected_reply_date: form.expected_reply_date || null,
      custom_fields: cleanedCustom,
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

  /** Inline status change from the table — optimistic, rolled back on failure. */
  async function updateStatus(app: Application, status: ApplicationStatus) {
    if (!user || status === app.status) return;
    const previous = app.status;

    setApplications((list) =>
      list.map((x) => (x.id === app.id ? { ...x, status } : x))
    );
    setError(null);

    const { error: err } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", app.id)
      .eq("user_id", user.id);

    if (err) {
      setError(err.message);
      setApplications((list) =>
        list.map((x) => (x.id === app.id ? { ...x, status: previous } : x))
      );
    }
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

  async function addCustomField(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = newFieldName.trim().replace(/\s+/g, " ");
    if (!name) return;

    setSavingField(true);
    setError(null);

    const nextPos =
      customFields.length === 0
        ? 0
        : Math.max(...customFields.map((f) => f.position)) + 1;

    const { error: err } = await supabase.from("app_custom_fields").insert({
      user_id: user.id,
      name,
      field_type: newFieldType,
      position: nextPos,
    });

    if (err) {
      setError(
        err.code === "23505"
          ? `You already have a field named "${name}".`
          : err.message
      );
    } else {
      setNewFieldName("");
      setNewFieldType("text");
      load();
    }
    setSavingField(false);
  }

  async function renameCustomField(field: AppCustomField) {
    if (!user) return;
    const next = prompt("Rename field", field.name);
    if (next === null) return;
    const name = next.trim().replace(/\s+/g, " ");
    if (!name || name === field.name) return;

    const { error: err } = await supabase
      .from("app_custom_fields")
      .update({ name })
      .eq("id", field.id)
      .eq("user_id", user.id);

    if (err) setError(err.message);
    else load();
  }

  async function deleteCustomField(field: AppCustomField) {
    if (!user) return;
    if (
      !confirm(
        `Delete the field "${field.name}"? Values saved on applications will no longer be shown.`
      )
    )
      return;

    const { error: err } = await supabase
      .from("app_custom_fields")
      .delete()
      .eq("id", field.id)
      .eq("user_id", user.id);

    if (err) setError(err.message);
    else load();
  }

  const filtered = applications.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    const customValues = Object.values(a.custom_fields ?? {}).join(" ");
    return (
      a.company.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.status.toLowerCase().includes(q) ||
      (a.location ?? "").toLowerCase().includes(q) ||
      (a.salary ?? "").toLowerCase().includes(q) ||
      customValues.toLowerCase().includes(q)
    );
  });

  const columnOptions: ColumnOption[] = useMemo(
    () => [
      { id: "company", label: "Company", locked: true },
      { id: "role", label: "Role" },
      { id: "status", label: "Status" },
      { id: "date_applied", label: "Date applied" },
      { id: "expected_reply_date", label: "Expected reply" },
      { id: "salary", label: "Salary" },
      { id: "location", label: "Location" },
      { id: "link", label: "Link" },
      { id: "notes", label: "Notes" },
      ...customFields.map((f) => ({ id: `cf_${f.id}`, label: f.name })),
    ],
    [customFields]
  );

  const columns = useMemo(() => {
    const all = [
      {
        id: "company",
        key: "company",
        header: "Company",
        render: (a: Application) => <strong>{a.company}</strong>,
      },
      {
        id: "role",
        key: "role",
        header: "Role",
        render: (a: Application) => a.role,
      },
      {
        id: "status",
        key: "status",
        header: "Status",
        render: (a: Application) => (
          <StatusSelect value={a.status} onChange={(s) => updateStatus(a, s)} />
        ),
      },
      {
        id: "date_applied",
        key: "date_applied",
        header: "Date applied",
        render: (a: Application) => (
          <span className="cell-muted">{formatDate(a.date_applied)}</span>
        ),
      },
      {
        id: "expected_reply_date",
        key: "expected_reply_date",
        header: "Expected reply",
        render: (a: Application) => {
          // Only flag a late reply while the application is still live.
          const live =
            a.status !== "Rejected" &&
            a.status !== "Withdrawn" &&
            a.status !== "Offer";
          return (
            <span
              className={
                live && isOverdue(a.expected_reply_date)
                  ? "badge badge-danger"
                  : live && isDueSoon(a.expected_reply_date)
                    ? "badge badge-warning"
                    : "cell-muted"
              }
            >
              {formatDate(a.expected_reply_date)}
            </span>
          );
        },
      },
      {
        id: "salary",
        key: "salary",
        header: "Salary",
        render: (a: Application) =>
          a.salary || <span className="cell-muted">—</span>,
      },
      {
        id: "location",
        key: "location",
        header: "Location",
        render: (a: Application) =>
          a.location || <span className="cell-muted">—</span>,
      },
      {
        id: "link",
        key: "link",
        header: "Link",
        render: (a: Application) =>
          a.link ? (
            <a
              className="cell-muted"
              href={withProtocol(a.link)}
              target="_blank"
              rel="noopener noreferrer"
              title={a.link}
              onClick={(e) => e.stopPropagation()}
            >
              {prettyUrl(a.link)}
            </a>
          ) : (
            <span className="cell-muted">—</span>
          ),
      },
      {
        id: "notes",
        key: "notes",
        header: "Notes",
        className: "cell-notes",
        render: (a: Application) => a.notes || "—",
      },
      ...customFields.map((f) => ({
        id: `cf_${f.id}`,
        key: `cf_${f.id}`,
        header: f.name,
        className: undefined,
        render: (a: Application) => {
          const raw = a.custom_fields?.[f.id] ?? "";
          if (!raw) return <span className="cell-muted">—</span>;
          if (f.field_type === "date")
            return <span className="cell-muted">{formatDate(raw)}</span>;
          return <>{raw}</>;
        },
      })),
    ];

    const visible = all.filter((c) => c.id === "company" || isVisible(c.id));

    return [
      ...visible,
      {
        id: "actions",
        key: "actions",
        header: "",
        className: "cell-actions",
        render: (a: Application) => (
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
    ];
  }, [customFields, isVisible]);

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
          placeholder="Search company, role, status, location…"
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
        <ColumnPicker
          options={columnOptions}
          isVisible={isVisible}
          onToggle={toggle}
          onShowAll={showAll}
          hiddenCount={hiddenCount}
          footer={
            <button
              type="button"
              className="link-btn"
              onClick={() => setFieldsModalOpen(true)}
            >
              Manage custom fields…
            </button>
          }
        />
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
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add your first application
            </button>
          )}
        </div>
      ) : (
        <DataTable data={filtered} keyFn={(a) => a.id} columns={columns} />
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
              <div className="help-text">Hold ⌘/Ctrl to select multiple.</div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="company">Company *</label>
                <input
                  id="company"
                  required
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
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
                    setForm({ ...form, date_applied: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="expected_reply_date">Expected reply</label>
                <input
                  id="expected_reply_date"
                  type="date"
                  value={toInputDate(form.expected_reply_date)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      expected_reply_date: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="salary">Salary</label>
                <input
                  id="salary"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  placeholder="e.g., $110k base + bonus"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g., New York, NY"
                />
              </div>
              <div className="form-field">
                <label htmlFor="link">Link</label>
                <input
                  id="link"
                  type="url"
                  value={form.link}
                  onChange={(e) => setForm({ ...form, link: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>

            {customFields.map((f) => (
              <div className="form-field" key={f.id}>
                <label htmlFor={`cf_${f.id}`}>{f.name}</label>
                <input
                  id={`cf_${f.id}`}
                  type={
                    f.field_type === "date"
                      ? "date"
                      : f.field_type === "number"
                        ? "number"
                        : "text"
                  }
                  value={
                    f.field_type === "date"
                      ? toInputDate(form.custom_fields?.[f.id] ?? "")
                      : (form.custom_fields?.[f.id] ?? "")
                  }
                  onChange={(e) => setCustomValue(f.id, e.target.value)}
                />
              </div>
            ))}

            <div className="form-field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save" : "Add application"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {fieldsModalOpen && (
        <Modal title="Custom fields" onClose={() => setFieldsModalOpen(false)}>
          <div className="entity-form">
            <div className="help-text" style={{ marginBottom: "0.75rem" }}>
              Custom fields appear on every application and can be shown or hidden
              from the Columns menu.
            </div>

            {customFields.length === 0 ? (
              <p className="cell-muted" style={{ margin: "0 0 1rem" }}>
                No custom fields yet.
              </p>
            ) : (
              <ul className="custom-field-list">
                {customFields.map((f) => (
                  <li key={f.id}>
                    <div>
                      <strong>{f.name}</strong>
                      <span className="cell-muted"> · {f.field_type}</span>
                    </div>
                    <div className="actions-group">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => renameCustomField(f)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteCustomField(f)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={addCustomField}>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="new_field_name">New field name *</label>
                  <input
                    id="new_field_name"
                    required
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="e.g., Referral source"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="new_field_type">Type</label>
                  <select
                    id="new_field_type"
                    value={newFieldType}
                    onChange={(e) =>
                      setNewFieldType(e.target.value as CustomFieldType)
                    }
                  >
                    {CUSTOM_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setFieldsModalOpen(false)}
                >
                  Done
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingField || !newFieldName.trim()}
                >
                  {savingField ? "Adding…" : "Add field"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
