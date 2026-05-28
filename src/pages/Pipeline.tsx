import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { toInputDate } from "../lib/dates";
import {
  DEFAULT_PIPELINE_STAGES,
  type Contact,
  type PipelineStage,
} from "../types/database";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import "./Pipeline.css";

const NOT_STARTED = "Not Started";

function normalizeStageName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function stageSort(a: PipelineStage, b: PipelineStage) {
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
}

export function Pipeline() {
  const { user } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addStageOpen, setAddStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#22c55e");
  const [savingStage, setSavingStage] = useState(false);

  const [renameStage, setRenameStage] = useState<PipelineStage | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameColor, setRenameColor] = useState("#22c55e");

  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactNotes, setContactNotes] = useState("");
  const [contactFollowUp, setContactFollowUp] = useState<string>("");
  const [savingContact, setSavingContact] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const [stagesRes, contactsRes] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("user_id", user.id)
        .order("position", { ascending: true }),
      supabase
        .from("contacts")
        .select("*")
        .eq("user_id", user.id)
        .order("name"),
    ]);

    if (stagesRes.error) setError(stagesRes.error.message);
    if (contactsRes.error) setError(contactsRes.error.message);

    setStages((stagesRes.data as PipelineStage[]) ?? []);
    setContacts((contactsRes.data as Contact[]) ?? []);

    setLoading(false);
  }, [user]);

  const ensureDefaults = useCallback(async () => {
    if (!user) return;
    const { data, error: err } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (err) {
      setError(err.message);
      return;
    }

    if ((data ?? []).length > 0) return;

    const inserts = DEFAULT_PIPELINE_STAGES.map((s, idx) => ({
      user_id: user.id,
      name: s.name,
      color: s.color,
      position: idx,
    }));

    const { error: insErr } = await supabase.from("pipeline_stages").insert(inserts);
    if (insErr) setError(insErr.message);
  }, [user]);

  useEffect(() => {
    (async () => {
      await ensureDefaults();
      await load();
    })();
  }, [ensureDefaults, load]);

  const stageList = useMemo(() => {
    const list = [...stages].sort(stageSort);
    const hasNotStarted = list.some((s) => s.name === NOT_STARTED);
    if (!hasNotStarted) {
      // Safety: if user deleted Not Started, still show it (DB default uses it).
      list.unshift({
        id: "virtual-not-started",
        user_id: user?.id ?? "",
        name: NOT_STARTED,
        color: "#64748b",
        position: -999,
        created_at: "",
        updated_at: "",
      });
    }
    return list;
  }, [stages, user?.id]);

  const contactsByStage = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const s of stageList) map.set(s.name, []);
    for (const c of contacts) {
      const stageName = c.pipeline_stage || NOT_STARTED;
      if (!map.has(stageName)) map.set(stageName, []);
      map.get(stageName)!.push(c);
    }
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
      map.set(key, list);
    }
    return map;
  }, [contacts, stageList]);

  async function moveContact(contactId: string, stageName: string) {
    if (!user) return;
    const normalized = normalizeStageName(stageName) || NOT_STARTED;
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage: normalized } : c))
    );

    const { error: err } = await supabase
      .from("contacts")
      .update({ pipeline_stage: normalized })
      .eq("id", contactId)
      .eq("user_id", user.id);

    if (err) {
      setError(err.message);
      load();
    }
  }

  async function createStage(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingStage(true);
    setError(null);

    const name = normalizeStageName(newStageName);
    if (!name) {
      setSavingStage(false);
      return;
    }

    const nextPos =
      stages.length === 0 ? 0 : Math.max(...stages.map((s) => s.position)) + 1;

    const { error: err } = await supabase.from("pipeline_stages").insert({
      user_id: user.id,
      name,
      color: newStageColor,
      position: nextPos,
    });

    if (err) setError(err.message);
    else {
      setAddStageOpen(false);
      setNewStageName("");
      setNewStageColor("#22c55e");
      load();
    }
    setSavingStage(false);
  }

  function openRename(stage: PipelineStage) {
    setRenameStage(stage);
    setRenameName(stage.name);
    setRenameColor(stage.color);
  }

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!user || !renameStage) return;
    setSavingStage(true);
    setError(null);

    const newName = normalizeStageName(renameName);
    const oldName = renameStage.name;
    if (!newName) {
      setSavingStage(false);
      return;
    }

    const { error: upErr } = await supabase
      .from("pipeline_stages")
      .update({ name: newName, color: renameColor })
      .eq("id", renameStage.id)
      .eq("user_id", user.id);

    if (upErr) {
      setError(upErr.message);
      setSavingStage(false);
      return;
    }

    if (oldName !== newName) {
      const { error: cErr } = await supabase
        .from("contacts")
        .update({ pipeline_stage: newName })
        .eq("user_id", user.id)
        .eq("pipeline_stage", oldName);
      if (cErr) setError(cErr.message);
    }

    setRenameStage(null);
    setSavingStage(false);
    load();
  }

  async function deleteStage(stage: PipelineStage) {
    if (!user) return;
    if (stage.name === NOT_STARTED) return;
    if (!confirm(`Delete stage "${stage.name}"? Contacts will move to "${NOT_STARTED}".`))
      return;

    setError(null);

    const { error: moveErr } = await supabase
      .from("contacts")
      .update({ pipeline_stage: NOT_STARTED })
      .eq("user_id", user.id)
      .eq("pipeline_stage", stage.name);
    if (moveErr) {
      setError(moveErr.message);
      return;
    }

    const { error: delErr } = await supabase
      .from("pipeline_stages")
      .delete()
      .eq("user_id", user.id)
      .eq("id", stage.id);

    if (delErr) setError(delErr.message);
    load();
  }

  function openContact(contact: Contact) {
    setEditingContact(contact);
    setContactNotes(contact.notes ?? "");
    setContactFollowUp(contact.follow_up_date ?? "");
  }

  function closeContact() {
    setEditingContact(null);
    setContactNotes("");
    setContactFollowUp("");
  }

  async function saveContact(e: FormEvent) {
    e.preventDefault();
    if (!user || !editingContact) return;
    setSavingContact(true);
    setError(null);

    const { error: err } = await supabase
      .from("contacts")
      .update({
        notes: contactNotes,
        follow_up_date: contactFollowUp || null,
      })
      .eq("user_id", user.id)
      .eq("id", editingContact.id);

    if (err) setError(err.message);
    else {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === editingContact.id
            ? { ...c, notes: contactNotes, follow_up_date: contactFollowUp || null }
            : c
        )
      );
      closeContact();
    }

    setSavingContact(false);
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div className="pipeline-wrap">
      <PageHeader
        title="Pipeline"
        subtitle="Drag contacts across stages as you network"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setAddStageOpen(true)}>
            Add stage
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="pipeline-board" role="region" aria-label="Contact pipeline board">
        {stageList.map((stage) => {
          const list = contactsByStage.get(stage.name) ?? [];
          return (
            <section key={stage.id} className="stage-col">
              <div className="stage-head">
                <div className="stage-title">
                  <span className="stage-dot" style={{ background: stage.color }} aria-hidden />
                  <span className="stage-name" title={stage.name}>
                    {stage.name}
                  </span>
                  <span className="stage-count">{list.length}</span>
                </div>
                <div className="stage-actions">
                  {stage.id !== "virtual-not-started" && stage.name !== NOT_STARTED && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openRename(stage)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteStage(stage)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div
                className={`dropzone${overStage === stage.name ? " dropzone-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.name);
                }}
                onDragLeave={() => setOverStage((prev) => (prev === stage.name ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || draggingId;
                  if (id) moveContact(id, stage.name);
                  setDraggingId(null);
                  setOverStage(null);
                }}
              >
                {list.length === 0 ? (
                  <div className="stage-empty">Drop a contact here.</div>
                ) : (
                  list.map((c) => (
                    <div
                      key={c.id}
                      className="contact-card"
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(c.id);
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                      onClick={() => openContact(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openContact(c);
                      }}
                      title="Click to edit"
                    >
                      <p className="card-title">{c.name}</p>
                      <p className="card-sub">
                        {c.company || "—"}
                        {c.role ? ` • ${c.role}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {addStageOpen && (
        <Modal title="Add stage" onClose={() => setAddStageOpen(false)}>
          <form className="entity-form" onSubmit={createStage}>
            <div className="stage-form-row">
              <div className="form-field">
                <label htmlFor="stage_name">Stage name *</label>
                <input
                  id="stage_name"
                  required
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="e.g., Coffee Chat Scheduled"
                />
              </div>
              <div className="form-field">
                <label htmlFor="stage_color">Color</label>
                <input
                  id="stage_color"
                  type="color"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  aria-label="Stage color"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAddStageOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingStage}>
                {savingStage ? "Saving…" : "Add stage"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {renameStage && (
        <Modal title="Rename stage" onClose={() => setRenameStage(null)}>
          <form className="entity-form" onSubmit={saveRename}>
            <div className="stage-form-row">
              <div className="form-field">
                <label htmlFor="rename_name">Stage name *</label>
                <input
                  id="rename_name"
                  required
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="rename_color">Color</label>
                <input
                  id="rename_color"
                  type="color"
                  value={renameColor}
                  onChange={(e) => setRenameColor(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRenameStage(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingStage}>
                {savingStage ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingContact && (
        <Modal title={`Edit ${editingContact.name}`} onClose={closeContact}>
          <form className="entity-form" onSubmit={saveContact}>
            <div className="form-field">
              <label htmlFor="follow_up_date">Follow up</label>
              <input
                id="follow_up_date"
                type="date"
                value={toInputDate(contactFollowUp)}
                onChange={(e) => setContactFollowUp(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeContact}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingContact}>
                {savingContact ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

