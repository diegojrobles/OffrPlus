import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import {
  contentTypeFor,
  extractResumeText,
  formatBytes,
  MAX_RESUME_BYTES,
  RESUME_ACCEPT,
  resumeFileKind,
  type ResumeFileKind,
} from "../lib/files";
import type { Resume, ResumeInsert } from "../types/database";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

const RESUME_BUCKET = "resumes";

const emptyForm: ResumeInsert = {
  company: "",
  title: "",
  resume_text: "",
  notes: "",
  file_path: null,
  file_name: null,
  file_size: null,
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

  // Staged upload: the file is held locally until the form is submitted, so a
  // cancelled edit doesn't leave an orphan object in storage.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingKind, setPendingKind] = useState<ResumeFileKind | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function resetFileState() {
    setPendingFile(null);
    setPendingKind(null);
    setRemoveExistingFile(false);
    setExtractNote(null);
    setExtracting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    resetFileState();
    setModalOpen(true);
  }

  function openEdit(resume: Resume) {
    setEditing(resume);
    setForm({
      company: resume.company,
      title: resume.title,
      resume_text: resume.resume_text,
      notes: resume.notes,
      file_path: resume.file_path,
      file_name: resume.file_name,
      file_size: resume.file_size,
    });
    resetFileState();
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    resetFileState();
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

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setExtractNote(null);

    const kind = resumeFileKind(file);
    if (!kind) {
      setError(
        file.name.toLowerCase().endsWith(".doc")
          ? "Older .doc files can't be read. Save it as .docx or PDF and try again."
          : "Only PDF and .docx files are supported."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_RESUME_BYTES) {
      setError(`That file is ${formatBytes(file.size)}. The limit is 10 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setPendingFile(file);
    setPendingKind(kind);
    setRemoveExistingFile(false);
    setExtracting(true);

    try {
      const text = await extractResumeText(file, kind);
      if (text.length < 20) {
        setExtractNote(
          kind === "pdf"
            ? "Couldn't read text from this PDF — it's likely a scan or image. The file will still be saved; paste the text below if you want to use the analyzer."
            : "Couldn't read text from this document. The file will still be saved; paste the text below if you want to use the analyzer."
        );
      } else if (form.resume_text.trim() && form.resume_text.trim() !== text.trim()) {
        // Don't silently clobber text the user already wrote.
        const replace = confirm(
          "Replace the existing resume text with the text extracted from this file?"
        );
        if (replace) {
          setForm((prev) => ({ ...prev, resume_text: text }));
          setExtractNote(`Extracted ${text.length.toLocaleString()} characters.`);
        } else {
          setExtractNote("Kept your existing text. The file will still be attached.");
        }
      } else {
        setForm((prev) => ({ ...prev, resume_text: text }));
        setExtractNote(`Extracted ${text.length.toLocaleString()} characters.`);
      }
    } catch (err) {
      setExtractNote(
        `Couldn't extract text (${
          err instanceof Error ? err.message : "unknown error"
        }). The file will still be attached.`
      );
    } finally {
      setExtracting(false);
    }
  }

  function clearAttachment() {
    setPendingFile(null);
    setExtractNote(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Only flag deletion if there's a stored file to delete.
    if (form.file_path) setRemoveExistingFile(true);
    setForm((prev) => ({
      ...prev,
      file_path: null,
      file_name: null,
      file_size: null,
    }));
  }

  async function openStoredFile(resume: Resume) {
    if (!resume.file_path) return;
    setError(null);

    const { data, error: err } = await supabase.storage
      .from(RESUME_BUCKET)
      .createSignedUrl(resume.file_path, 60);

    if (err) {
      setError(err.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const originalPath = editing?.file_path ?? null;
    let filePath = form.file_path;
    let fileName = form.file_name;
    let fileSize = form.file_size;
    let uploadedPath: string | null = null;

    if (pendingFile) {
      const kind = pendingKind ?? "pdf";
      const path = `${user.id}/${crypto.randomUUID()}.${kind}`;
      const { error: upErr } = await supabase.storage
        .from(RESUME_BUCKET)
        .upload(path, pendingFile, {
          contentType: contentTypeFor(kind),
          upsert: false,
        });

      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setSaving(false);
        return;
      }

      uploadedPath = path;
      filePath = path;
      fileName = pendingFile.name;
      fileSize = pendingFile.size;
    }

    const row = {
      company: form.company,
      title: form.title,
      resume_text: form.resume_text,
      notes: form.notes,
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
    };

    const rollbackUpload = async () => {
      if (uploadedPath) {
        await supabase.storage.from(RESUME_BUCKET).remove([uploadedPath]);
      }
    };

    if (editing) {
      const { error: err } = await supabase
        .from("resumes")
        .update(row)
        .eq("id", editing.id)
        .eq("user_id", user.id);

      if (err) {
        await rollbackUpload();
        setError(err.message);
      } else {
        // The row now points elsewhere, so the old object is safe to drop.
        const stale =
          originalPath && originalPath !== filePath ? originalPath : null;
        if (stale || (removeExistingFile && originalPath && !filePath)) {
          await supabase.storage
            .from(RESUME_BUCKET)
            .remove([stale ?? originalPath!]);
        }
        closeModal();
        load();
      }
    } else {
      const { error: err } = await supabase
        .from("resumes")
        .insert({ ...row, user_id: user.id });

      if (err) {
        await rollbackUpload();
        setError(err.message);
      } else {
        closeModal();
        load();
      }
    }
    setSaving(false);
  }

  async function handleDelete(resume: Resume) {
    if (!user || !confirm("Delete this resume entry?")) return;

    const { error: err } = await supabase
      .from("resumes")
      .delete()
      .eq("id", resume.id)
      .eq("user_id", user.id);

    if (err) {
      setError(err.message);
      return;
    }

    if (resume.file_path) {
      await supabase.storage.from(RESUME_BUCKET).remove([resume.file_path]);
    }
    load();
  }

  async function runAnalyze() {
    if (!user || !editing) return;
    setAnalyzing(true);
    setError(null);
    setAnalyzeResult(null);

    const { data, error: err } = await supabase.functions.invoke("keyword-analyze", {
      body: {
        resumeText: editing.resume_text,
        jobDescription: analyzeJobDesc,
      },
    });

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
      (r.file_name ?? "").toLowerCase().includes(q) ||
      r.notes.toLowerCase().includes(q)
    );
  });

  const attachedName = pendingFile?.name ?? form.file_name;
  const attachedSize = pendingFile?.size ?? form.file_size;

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
          placeholder="Search company, title, file, notes…"
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
              key: "file",
              header: "File",
              render: (r) =>
                r.file_path ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openStoredFile(r);
                    }}
                    title={r.file_name ?? "Open file"}
                  >
                    {r.file_name?.toLowerCase().endsWith(".docx") ? "DOCX" : "PDF"}
                    {r.file_size ? ` · ${formatBytes(r.file_size)}` : ""}
                  </button>
                ) : (
                  <span className="cell-muted">—</span>
                ),
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
                    onClick={() => handleDelete(r)}
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
              <label htmlFor="resume_file">Resume file</label>
              {attachedName ? (
                <div className="file-chip">
                  <div className="file-chip-main">
                    <span className="file-chip-name" title={attachedName}>
                      {attachedName}
                    </span>
                    <span className="cell-muted">
                      {attachedSize ? formatBytes(attachedSize) : ""}
                      {pendingFile ? " · not uploaded yet" : ""}
                    </span>
                  </div>
                  <div className="actions-group">
                    {!pendingFile && editing?.file_path && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => editing && openStoredFile(editing)}
                      >
                        View
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={clearAttachment}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost file-drop"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose a PDF or Word file…
                </button>
              )}

              <input
                id="resume_file"
                ref={fileInputRef}
                type="file"
                accept={RESUME_ACCEPT}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              <div className="help-text">
                {extracting
                  ? "Reading text from your file…"
                  : (extractNote ??
                    "PDF or Word (.docx), up to 10 MB. Text is pulled out automatically so the analyzer can use it.")}
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="resume_text">Resume text</label>
              <textarea
                id="resume_text"
                value={form.resume_text}
                onChange={(e) => setForm({ ...form, resume_text: e.target.value })}
                placeholder="Extracted from your file, or paste it here…"
                style={{ minHeight: 220 }}
              />
              <div className="help-text">
                Used by the AI keyword analyzer. Edit freely — changes here don't
                affect the stored file.
              </div>
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
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || extracting}
              >
                {saving
                  ? pendingFile
                    ? "Uploading…"
                    : "Saving…"
                  : editing
                    ? "Save"
                    : "Add resume"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {analyzeOpen && editing && (
        <Modal title="AI keyword analyzer" onClose={closeAnalyze}>
          <div className="entity-form">
            {!editing.resume_text.trim() && (
              <div className="help-text" style={{ marginBottom: "0.75rem" }}>
                This resume has no text saved, so the analyzer has nothing to read.
                Open Edit and attach a text-based PDF or Word file, or paste the text first.
              </div>
            )}
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
                disabled={
                  analyzing || !analyzeJobDesc.trim() || !editing.resume_text.trim()
                }
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
