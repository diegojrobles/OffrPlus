import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Resume, ResumeInsert } from "../types/database";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

const emptyForm: ResumeInsert = {
  company: "",
  title: "",
  resume_text: "",
  notes: "",
};

type AnalyzeResult = {
  missing_keywords: string[];
  suggested_improvements: string[];
};

export function Resumes() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resume | null>(null);
  const [form, setForm] = useState<ResumeInsert>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeJobDesc, setAnalyzeJobDesc] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (err) setError(err.message);
    else setResumes((data as Resume[]) ?? []);
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

  function openEdit(resume: Resume) {
    setEditing(resume);
    setForm({
      company: resume.company,
      title: resume.title,
      resume_text: resume.resume_text,
      notes: resume.notes,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function openAnalyze(resume: Resume) {
    setEditing(resume);
    setAnalyzeJobDesc("");
    setAnalyzeResult(null);
    setAnalyzeOpen(true);
  }

  function closeAnalyze() {
    setAnalyzeOpen(false);
    setAnalyzeJobDesc("");
    setAnalyzeResult(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const row = {
      ...form,
    };

    if (editing) {
      const { error: err } = await supabase
        .from("resumes")
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
        .from("resumes")
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
    if (!user || !confirm("Delete this resume entry?")) return;
    const { error: err } = await supabase
      .from("resumes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (err) setError(err.message);
    else load();
  }

  async function runAnalyze() {
    if (!user || !editing) return;
    setAnalyzing(true);
    setError(null);
    setAnalyzeResult(null);

    const { data, error: err } = await supabase.functions.invoke(
      "keyword-analyze",
      {
        body: {
          resumeText: editing.resume_text,
          jobDescription: analyzeJobDesc,
        },
      }
    );

    if (err) setError(err.message);
    else setAnalyzeResult(data as AnalyzeResult);

    setAnalyzing(false);
  }

  const filtered = resumes.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.company.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.resume_text.toLowerCase().includes(q) ||
      r.notes.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Resumes"
        subtitle="Store versions, tag to companies, and track customizations"
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add resume
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search company, title, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search resumes"
        />
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner" aria-hidden />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <p>{search ? "No resumes match your search." : "No resumes yet."}</p>
          {!search && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add your first resume
            </button>
          )}
        </div>
      ) : (
        <DataTable
          data={filtered}
          keyFn={(r) => r.id}
          columns={[
            {
              key: "company",
              header: "Company",
              render: (r) => <strong>{r.company || "—"}</strong>,
            },
            {
              key: "title",
              header: "Title",
              render: (r) => r.title || "—",
            },
            {
              key: "notes",
              header: "Notes",
              className: "cell-notes",
              render: (r) => r.notes || "—",
            },
            {
              key: "actions",
              header: "",
              className: "cell-actions",
              render: (r) => (
                <div className="actions-group" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openAnalyze(r)}
                  >
                    Analyze
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEdit(r)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(r.id)}
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
        <Modal title={editing ? "Edit resume" : "Add resume"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="entity-form">
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="company">Company</label>
                <input
                  id="company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="e.g., JPMorgan"
                />
              </div>
              <div className="form-field">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., IB resume v2"
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="resume_text">Resume text *</label>
              <textarea
                id="resume_text"
                required
                value={form.resume_text}
                onChange={(e) => setForm({ ...form, resume_text: e.target.value })}
                placeholder="Paste your resume text here…"
                style={{ minHeight: 220 }}
              />
            </div>
            <div className="form-field">
              <label htmlFor="notes">Customization notes</label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="What did you customize for this company?"
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save" : "Add resume"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {analyzeOpen && editing && (
        <Modal title="AI keyword analyzer" onClose={closeAnalyze}>
          <div className="entity-form">
            <div className="form-field">
              <label htmlFor="job_desc">Job description *</label>
              <textarea
                id="job_desc"
                value={analyzeJobDesc}
                onChange={(e) => setAnalyzeJobDesc(e.target.value)}
                placeholder="Paste the job description here…"
                style={{ minHeight: 180 }}
              />
              <div className="help-text">
                Sends your resume text + this job description to a server-side Claude
                call (via Supabase Edge Function).
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeAnalyze}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={runAnalyze}
                disabled={analyzing || !analyzeJobDesc.trim()}
              >
                {analyzing ? "Analyzing…" : "Analyze"}
              </button>
            </div>

            {analyzeResult && (
              <div className="card" style={{ marginTop: "1rem" }}>
                <h3 style={{ margin: "0 0 0.75rem" }}>Missing keywords</h3>
                {analyzeResult.missing_keywords.length === 0 ? (
                  <p className="cell-muted" style={{ margin: 0 }}>
                    No obvious missing keywords found.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {analyzeResult.missing_keywords.map((k) => (
                      <span key={k} className="badge badge-accent">
                        {k}
                      </span>
                    ))}
                  </div>
                )}

                <h3 style={{ margin: "1.25rem 0 0.75rem" }}>Suggested improvements</h3>
                {analyzeResult.suggested_improvements.length === 0 ? (
                  <p className="cell-muted" style={{ margin: 0 }}>
                    No suggestions returned.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {analyzeResult.suggested_improvements.map((s, idx) => (
                      <li key={idx} style={{ marginBottom: "0.5rem" }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

