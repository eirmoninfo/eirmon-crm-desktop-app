// src/pages/RoughWorkNotepad.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../api/http"; // your api helper
import AppLayout from "../components/layout/AppLayout";
import { GlassButton, GlassCard } from "../components/glass/Glass";
import jsPDF from "jspdf";
import Sortable from "sortablejs";

const RoughWorkNotepad = () => {
  const navigate = useNavigate();

  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("Ready. Auto-save enabled.");
  const [lastSaved, setLastSaved] = useState("Just now");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareNoteId, setShareNoteId] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permission, setPermission] = useState("view");
  const [users, setUsers] = useState([]);

  const tabsRef = useRef(null);
  const sortableRef = useRef(null);
  const autoSaveTimeout = useRef(null);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId),
    [notes, activeNoteId]
  );
  const isReadOnly =
    !!activeNote && !activeNote.is_owner && activeNote.permission === "view";

  // ---------- Load notes + users ----------
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiRequest("/rough-work");
        if (res?.success) {
          const loaded = res.notes || [];
          setNotes(loaded);
          if (loaded.length > 0) setActiveNoteId(loaded[0].id);
        }

        const usersRes = await apiRequest("/users/company");
        setUsers(usersRes?.data || []);
      } catch (err) {
        toast.error("Failed to load notes");
      }
    };

    fetchData();
  }, []);

  // ---------- Sortable tabs (prevent multiple instances) ----------
  useEffect(() => {
    if (!tabsRef.current) return;

    if (sortableRef.current) {
      sortableRef.current.destroy();
      sortableRef.current = null;
    }

    sortableRef.current = new Sortable(tabsRef.current, {
      animation: 150,
      handle: ".tab",
      filter: ".shared-tab",
      onEnd: async () => {
        const order = Array.from(tabsRef.current.children)
          .filter((el) => !el.classList.contains("shared-tab"))
          .map((el) => el.dataset.noteId);

        try {
          await apiRequest("/rough-work/reorder", {
            method: "POST",
            body: JSON.stringify({ order }),
          });
          toast.success("Notes reordered");
        } catch (err) {
          toast.error("Reorder failed");
        }
      },
    });

    return () => {
      if (sortableRef.current) {
        sortableRef.current.destroy();
        sortableRef.current = null;
      }
    };
  }, [notes]);

  // ---------- Helper: get editor ----------
  const getEditor = (noteId) =>
    document.getElementById(`editor-${noteId}`);

  // ---------- When switching note: set editor HTML ONLY ONCE ----------
  useEffect(() => {
    if (!activeNoteId) return;

    const note = notes.find((n) => n.id === activeNoteId);
    const editor = getEditor(activeNoteId);

    // If editor is not yet in DOM, wait a tick.
    if (!editor) {
      setTimeout(() => {
        const ed = getEditor(activeNoteId);
        if (ed && note) ed.innerHTML = note.content || "";
      }, 0);
      return;
    }

    if (note) editor.innerHTML = note.content || "";
  }, [activeNoteId]); // IMPORTANT: only on note switch

  // ---------- Auto-save logic ----------
  const autoSave = (noteId, content) => {
    if (!noteId) return;

    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);

    autoSaveTimeout.current = setTimeout(async () => {
      setSaveStatus("Saving...");
      try {
        await apiRequest(`/rough-work/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({ content }),
        });

        setLastSaved(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        );

        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus("Ready. Auto-save enabled."), 1500);
      } catch (err) {
        setSaveStatus("Error — retrying...");
        setTimeout(() => autoSave(noteId, content), 2500);
      }
    }, 900);
  };

  // ---------- Typing: update notes state (prevents disappearing) + autosave (prevents cursor jump) ----------
  const handleContentChange = (e) => {
    if (!activeNoteId) return;

    const content = e.currentTarget.innerHTML;

    // ✅ keep latest content in state so re-render never wipes editor
    setNotes((prev) =>
      prev.map((n) => (n.id === activeNoteId ? { ...n, content } : n))
    );

    autoSave(activeNoteId, content);
  };

  const switchTab = (noteId) => {
    setActiveNoteId(noteId);
  };

  const createNewNote = async () => {
    try {
      const res = await apiRequest("/rough-work", { method: "POST" });
      if (res?.success) {
        setNotes((prev) => [...prev, res.note]);
        setActiveNoteId(res.note.id);
        toast.success("New note created");
      }
    } catch (err) {
      toast.error("Failed to create note");
    }
  };

  const openDeleteModal = (noteId) => {
    setDeleteNoteId(noteId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await apiRequest(`/rough-work/${deleteNoteId}`, { method: "DELETE" });

      setNotes((prev) => prev.filter((n) => n.id !== deleteNoteId));

      if (activeNoteId === deleteNoteId) {
        const remaining = notes.filter((n) => n.id !== deleteNoteId);
        setActiveNoteId(remaining[0]?.id || null);
      }

      toast.success("Note deleted");
    } catch (err) {
      toast.error("Delete failed");
    }
    setDeleteModalOpen(false);
  };

  const openShareModal = (noteId) => {
    setShareNoteId(noteId);
    setSelectedUsers([]);
    setPermission("view");
    setShareModalOpen(true);
  };

  const handleShare = async (e) => {
    e.preventDefault();
    if (selectedUsers.length === 0)
      return toast.error("Select at least one user");

    try {
      const res = await apiRequest(`/rough-work/${shareNoteId}/share`, {
        method: "POST",
        body: JSON.stringify({
          user_ids: selectedUsers,
          permission,
        }),
      });

      if (res?.success) {
        toast.success(res.message || "Note shared");
        setShareModalOpen(false);
      }
    } catch (err) {
      toast.error("Share failed");
    }
  };

  const renameTitle = async (noteId, newTitle) => {
    if (!newTitle?.trim()) return;

    const title = newTitle.trim();

    // update UI instantly
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, title } : n))
    );

    try {
      await apiRequest(`/rough-work/${noteId}`, {
        method: "PUT",
        body: JSON.stringify({ title }),
      });
    } catch (err) {
      toast.error("Rename failed");
    }
  };

  const formatText = (command, value = null) => {
    const editor = getEditor(activeNoteId);
    if (!editor || editor.isContentEditable === "false") {
      toast("This note is read-only");
      return;
    }

    document.execCommand(command, false, value);

    // ✅ after formatting, sync state + autosave
    const content = editor.innerHTML;

    setNotes((prev) =>
      prev.map((n) => (n.id === activeNoteId ? { ...n, content } : n))
    );

    autoSave(activeNoteId, content);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const editor = getEditor(activeNoteId);
    const title = notes.find((n) => n.id === activeNoteId)?.title || "Note";

    doc.setFontSize(16);
    doc.text(title, 10, 10);
    doc.setFontSize(12);
    doc.text(editor?.innerText || "", 10, 20, { maxWidth: 190 });
    doc.save(`${title}.pdf`);
    toast.success("PDF downloaded");
  };

  const copyToClipboard = () => {
    const editor = getEditor(activeNoteId);
    navigator.clipboard.writeText(editor?.innerText || "");
    toast.success("Copied to clipboard");
  };

  const clearCurrentNote = () => {
    if (!confirm("Clear current note?")) return;

    const editor = getEditor(activeNoteId);
    if (!editor) return;

    editor.innerHTML = "";

    // ✅ sync state + autosave
    setNotes((prev) =>
      prev.map((n) => (n.id === activeNoteId ? { ...n, content: "" } : n))
    );

    autoSave(activeNoteId, "");
    toast.success("Note cleared");
  };

  return (
    <AppLayout>
        <div className="max-w-5xl mx-auto">
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold theme-text flex items-center gap-3">
                  <svg
                    className="w-10 h-10 text-teal-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Workspace Notes
                </h1>

                <div className="flex items-center gap-4">
                  <div
                    className="text-sm font-medium text-glass-muted"
                  >
                    {saveStatus}
                  </div>

                  <GlassButton onClick={createNewNote}>
                    New Note
                  </GlassButton>
                </div>
              </div>

              {/* Tabs */}
              <div
                ref={tabsRef}
                className="flex flex-wrap border-b border-white/10 mb-4 overflow-x-auto"
              >
                {notes.map((note) => (
                  <div
                    key={note.id}
                    data-note-id={note.id}
                    className={`tab flex items-center px-4 py-2 cursor-pointer hover:bg-white/10 transition group ${
                      activeNoteId === note.id
                        ? "border-b-2 border-[#0a84ff] bg-white/5"
                        : ""
                    } ${!note.is_owner ? "shared-tab" : ""}`}
                    onClick={() => switchTab(note.id)}
                  >
                    <span
                      className="title theme-text font-medium mr-2"
                      contentEditable={note.is_owner ? "true" : "false"}
                      suppressContentEditableWarning
                      onDoubleClick={(e) => {
                        if (note.is_owner) e.target.focus();
                      }}
                      onBlur={(e) => {
                        if (note.is_owner)
                          renameTitle(note.id, e.target.textContent);
                      }}
                    >
                      {note.title}
                      {!note.is_owner && (
                        <span className="text-xs text-teal-600 ml-2">
                          (Shared by {note.shared_by})
                        </span>
                      )}
                    </span>

                    {note.is_owner && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openShareModal(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800 mx-1"
                        title="Share"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 2.684a3 3 0 10-6 0m6 0a3 3 0 01-6 0m6 0v3m-6-3v3m-9-3h18"
                          />
                        </svg>
                      </button>
                    )}

                    {note.is_owner ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteModal(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 ml-auto"
                        title="Delete"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    ) : (
                      <span
                        className={`ml-auto text-xs font-medium ${
                          note.permission === "edit"
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        {note.permission === "edit" ? "Can edit" : "Read-only"}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-2 mb-4 bg-white/5 p-2 rounded-lg border border-white/10">
                <button onClick={() => formatText("bold")} title="Bold">
                  <b>B</b>
                </button>
                <button onClick={() => formatText("italic")} title="Italic">
                  <i>I</i>
                </button>
                <button
                  onClick={() => formatText("underline")}
                  title="Underline"
                >
                  <u>U</u>
                </button>
                <button
                  onClick={() => formatText("strikeThrough")}
                  title="Strikethrough"
                >
                  <s>S</s>
                </button>
                <button
                  onClick={() => formatText("insertUnorderedList")}
                  title="Bullet List"
                >
                  •
                </button>
                <button
                  onClick={() => formatText("insertOrderedList")}
                  title="Numbered List"
                >
                  1.
                </button>
                <button
                  onClick={() =>
                    formatText("createLink", prompt("Enter URL") || "")
                  }
                  title="Link"
                >
                  🔗
                </button>
                <button
                  onClick={() => formatText("justifyCenter")}
                  title="Center"
                >
                  ⟺
                </button>
                <button onClick={() => formatText("undo")} title="Undo">
                  ↩️
                </button>
                <button onClick={() => formatText("redo")} title="Redo">
                  ↪️
                </button>
                <button onClick={downloadPDF} title="Download PDF">
                  PDF
                </button>
              </div>

              {/* Editor */}
              {activeNote && (
                <div className="relative">
                  <div
                    id={`editor-${activeNote.id}`}
                    className={`notepad-editor min-h-[50vh] p-5 border border-[var(--theme-glass-border)] rounded-xl focus-within:ring-2 focus-within:ring-[#0a84ff]/50 shadow-inner prose max-w-none theme-text ${
                      isReadOnly
                        ? "bg-[var(--theme-hover)] cursor-not-allowed"
                        : "bg-[var(--theme-hover)]"
                    }`}
                    contentEditable={!isReadOnly}
                    suppressContentEditableWarning
                    onInput={handleContentChange}
                  />
                </div>
              )}

              {/* Footer */}
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-glass-muted">
                  Last saved: <span>{lastSaved}</span>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={copyToClipboard}
                    className="px-5 py-2 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 flex items-center gap-2"
                  >
                    Copy
                  </button>
                  <button
                    onClick={clearCurrentNote}
                    className="px-5 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-2"
                  >
                    Clear Current
                  </button>
                </div>
              </div>
          </GlassCard>
        </div>

      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <GlassCard className="max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-4 theme-text">Delete Note?</h3>
            <p className="text-glass-muted mb-6">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </GlassButton>
              <GlassButton variant="danger" onClick={confirmDelete}>
                Delete
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {shareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <GlassCard className="max-w-lg w-full mx-4">
            <h3 className="text-xl font-bold mb-4 theme-text">Share Note</h3>
            <form onSubmit={handleShare}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Share with:
                </label>
                <select
                  multiple
                  value={selectedUsers}
                  onChange={(e) =>
                    setSelectedUsers(
                      Array.from(e.target.selectedOptions, (o) => o.value)
                    )
                  }
                  className="w-full border rounded-lg p-3 focus:ring-teal-500"
                  required
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Hold Ctrl/Cmd to select multiple
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Permission:
                </label>
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className="w-full border rounded-lg p-3 focus:ring-teal-500"
                >
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <GlassButton type="button" variant="secondary" onClick={() => setShareModalOpen(false)}>
                  Cancel
                </GlassButton>
                <GlassButton type="submit">
                  Share Note
                </GlassButton>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </AppLayout>
  );
};

export default RoughWorkNotepad;
