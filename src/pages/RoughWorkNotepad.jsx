import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import Sortable from "sortablejs";
import {
  Bold,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  GripVertical,
  Hash,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  MoreHorizontal,
  Plus,
  Redo2,
  RefreshCw,
  Share2,
  Sparkles,
  Star,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { apiRequest } from "../api/http";
import { sendEirmonAiMessage } from "../api/eirmonAi.api";
import AppLayout from "../components/layout/AppLayout";
import {
  NOTE_TEMPLATES,
  accessLabel,
  canEditNote,
  getNoteCollaborators,
  mergeSharedNote,
  selectAfterDelete,
  updateNote,
} from "../utils/workspaceNotesModel";

const AI_MODES = [
  ["Summarize", "Summarize this page clearly and concisely."],
  ["Next actions", "Extract the concrete next actions from this page."],
  ["Polish wording", "Polish the wording of this page while preserving its meaning."],
  ["Expand", "Expand this page with useful detail while preserving its intent."],
];

const FAVORITES_KEY = "collabflow:workspace-note-favorites";

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  template.content
    .querySelectorAll("script,style,iframe,object,embed,meta,link,form,base")
    .forEach((element) => element.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        name === "formaction" ||
        (["href", "src", "xlink:href"].includes(name) &&
          (value.startsWith("javascript:") ||
            value.startsWith("vbscript:") ||
            value.startsWith("data:text/html")))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return template.innerHTML;
}

function readFavorites() {
  try {
    const ids = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function htmlToText(html) {
  const element = document.createElement("div");
  element.innerHTML = html || "";
  return element.innerText.trim();
}

function textToHtml(text) {
  const element = document.createElement("div");
  String(text || "")
    .split(/\n{2,}/)
    .forEach((paragraph) => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      element.appendChild(p);
    });
  return element.innerHTML;
}

function IconButton({ label, disabled, onClick, children, active = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`notes-icon-button ${active ? "notes-icon-button-active" : ""}`}
    >
      {children}
    </button>
  );
}

class WorkspaceNotesErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[WorkspaceNotes] Render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <AppLayout noPadding mainClassName="workspace-notes-host">
        <div className="notes-route-error">
          <FileText size={32} />
          <h1>Workspace Notes could not open</h1>
          <p>{this.state.error?.message || "An unexpected page error occurred."}</p>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Reload workspace
          </button>
        </div>
      </AppLayout>
    );
  }
}

function WorkspaceNotesContent() {
  const [notes, setNotes] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [section, setSection] = useState("pages");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState({});
  const [shareOpen, setShareOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permission, setPermission] = useState("view");
  const [favorites, setFavorites] = useState(readFavorites);
  const [insertOpen, setInsertOpen] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState(
    () => sessionStorage.getItem("collabflow:workspace-search") || ""
  );
  const listRef = useRef(null);
  const editorRef = useRef(null);
  const sortableRef = useRef(null);
  const saveTimersRef = useRef(new Map());
  const pendingPatchesRef = useRef(new Map());
  const previousNoteIdRef = useRef(null);

  const activeNote = useMemo(
    () => notes.find((note) => String(note.id) === String(activeNoteId)) ?? null,
    [notes, activeNoteId]
  );
  const editable = canEditNote(activeNote);
  const collaborators = useMemo(
    () => getNoteCollaborators(activeNote),
    [activeNote]
  );

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = activeNote?.content || "";
    // Content typed by the user is managed by the contentEditable element.
    // Replacing it on each state update moves the caret back to the beginning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  const visibleNotes = useMemo(() => {
    const sectionNotes = section === "pages" ? notes : section === "meetings"
      ? notes.filter((note) =>
          `${note.title || ""} ${note.template || ""}`.toLowerCase().includes("meeting")
        )
      : [...notes].sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at || 0) -
            new Date(a.updated_at || a.created_at || 0)
        );
    const query = workspaceSearch.trim().toLowerCase();
    if (!query) return sectionNotes;
    return sectionNotes.filter((note) =>
      `${note.title || ""} ${htmlToText(note.content || "")}`
        .toLowerCase()
        .includes(query)
    );
  }, [notes, section, workspaceSearch]);

  const loadWorkspace = useCallback(async ({ preserveSelection = true } = {}) => {
    setLoading(true);
    setLoadError("");
    try {
      const [notesResponse, usersResponse] = await Promise.all([
        apiRequest("/rough-work"),
        apiRequest("/users/company"),
      ]);
      const loaded = notesResponse?.notes ?? notesResponse?.data?.notes ?? [];
      const safeNotes = Array.isArray(loaded)
        ? loaded.map((note) => ({
            ...note,
            content: sanitizeHtml(note.content),
          }))
        : [];
      const usersPayload = usersResponse?.data ?? usersResponse?.users ?? [];
      const loadedUsers = Array.isArray(usersPayload?.data)
        ? usersPayload.data
        : Array.isArray(usersPayload)
          ? usersPayload
          : [];
      setNotes(safeNotes);
      setUsers(loadedUsers);
      setActiveNoteId((current) => {
        if (
          preserveSelection &&
          safeNotes.some((note) => String(note.id) === String(current))
        ) {
          return current;
        }
        return safeNotes[0]?.id ?? null;
      });
    } catch (error) {
      setLoadError(error?.message || "Workspace Notes could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  const persistNote = useCallback(async (noteId, patch) => {
    setSaveState((current) => ({ ...current, [noteId]: "saving" }));
    try {
      await apiRequest(`/rough-work/${noteId}`, {
        method: "PUT",
        body: patch,
      });
      setSaveState((current) => ({ ...current, [noteId]: "saved" }));
    } catch {
      setSaveState((current) => ({ ...current, [noteId]: "failed" }));
    }
  }, []);

  useEffect(() => {
    const timers = saveTimersRef.current;
    const pending = pendingPatchesRef.current;
    queueMicrotask(() => void loadWorkspace({ preserveSelection: false }));
    const handleWorkspaceSearch = (event) =>
      setWorkspaceSearch(String(event.detail?.query || ""));
    const flushPending = () => {
      for (const [noteId, patch] of pending) {
        void persistNote(noteId, patch);
      }
      pending.clear();
    };
    window.addEventListener("collabflow:workspace-search", handleWorkspaceSearch);
    window.addEventListener("pagehide", flushPending);
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      flushPending();
      window.removeEventListener("collabflow:workspace-search", handleWorkspaceSearch);
      window.removeEventListener("pagehide", flushPending);
    };
  }, [loadWorkspace, persistNote]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  useEffect(() => {
    if (!listRef.current || section !== "pages" || workspaceSearch) return undefined;
    const sortable = new Sortable(listRef.current, {
      animation: 150,
      handle: ".notes-drag-handle",
      filter: ".notes-shared-page",
      onEnd: async ({ oldIndex, newIndex }) => {
        if (oldIndex === newIndex || oldIndex == null || newIndex == null) return;
        const orderedIds = [...listRef.current.querySelectorAll("[data-note-id]")]
          .map((element) => String(element.dataset.noteId));
        const byId = new Map(notes.map((note) => [String(note.id), note]));
        const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        const ownedIds = ordered
          .filter((note) => note.is_owner)
          .map((note) => note.id);
        setNotes(ordered);
        try {
          await apiRequest("/rough-work/reorder", {
            method: "POST",
            body: { order: ownedIds },
          });
        } catch {
          toast.error("Page order could not be saved.");
          void loadWorkspace();
        }
      },
    });
    sortableRef.current = sortable;
    return () => {
      if (sortableRef.current === sortable) sortableRef.current = null;
      try {
        sortable.destroy();
      } catch {
        // React Strict Mode may run effect cleanup twice in development.
      }
    };
  }, [notes, section, workspaceSearch, loadWorkspace]);

  const scheduleSave = useCallback(
    (noteId, patch) => {
      const existing = saveTimersRef.current.get(noteId);
      if (existing) clearTimeout(existing);
      pendingPatchesRef.current.set(noteId, {
        ...(pendingPatchesRef.current.get(noteId) || {}),
        ...patch,
      });
      setSaveState((current) => ({ ...current, [noteId]: "pending" }));
      const timer = setTimeout(() => {
        saveTimersRef.current.delete(noteId);
        const pending = pendingPatchesRef.current.get(noteId);
        pendingPatchesRef.current.delete(noteId);
        if (pending) void persistNote(noteId, pending);
      }, 800);
      saveTimersRef.current.set(noteId, timer);
    },
    [persistNote]
  );

  const flushNoteSave = useCallback(
    (noteId) => {
      if (noteId == null) return;
      const timer = saveTimersRef.current.get(noteId);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.delete(noteId);
      const pending = pendingPatchesRef.current.get(noteId);
      pendingPatchesRef.current.delete(noteId);
      if (pending) void persistNote(noteId, pending);
    },
    [persistNote]
  );

  useEffect(() => {
    const previous = previousNoteIdRef.current;
    if (previous != null && String(previous) !== String(activeNoteId)) {
      flushNoteSave(previous);
    }
    previousNoteIdRef.current = activeNoteId;
  }, [activeNoteId, flushNoteSave]);

  const changeContent = (event) => {
    if (!activeNote || !editable) return;
    const content = sanitizeHtml(event.currentTarget.innerHTML);
    const updated_at = new Date().toISOString();
    setNotes((current) =>
      updateNote(current, activeNote.id, { content, updated_at })
    );
    scheduleSave(activeNote.id, { content });
  };

  const changeTitle = (title) => {
    if (!activeNote || !editable) return;
    setNotes((current) =>
      updateNote(current, activeNote.id, {
        title,
        updated_at: new Date().toISOString(),
      })
    );
    scheduleSave(activeNote.id, { title });
  };

  const createPage = async (template) => {
    setTemplateOpen(false);
    try {
      const response = await apiRequest("/rough-work", { method: "POST" });
      const created = response?.note ?? response?.data?.note;
      if (!created?.id) throw new Error("The backend did not return the new page.");
      const next = { ...created, title: template.title, content: template.content };
      setNotes((current) => [...current, next]);
      setActiveNoteId(next.id);
      await persistNote(next.id, {
        title: template.title,
        content: template.content,
      });
    } catch (error) {
      toast.error(error?.message || "Page could not be created.");
    }
  };

  const deletePage = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/rough-work/${deleteTarget.id}`, { method: "DELETE" });
      const nextId = selectAfterDelete(notes, deleteTarget.id, activeNoteId);
      setNotes((current) =>
        current.filter((note) => String(note.id) !== String(deleteTarget.id))
      );
      setActiveNoteId(nextId);
      setDeleteTarget(null);
    } catch {
      toast.error("Page could not be deleted.");
    }
  };

  const sharePage = async (event) => {
    event.preventDefault();
    if (!activeNote || selectedUsers.length === 0) return;
    try {
      const response = await apiRequest(`/rough-work/${activeNote.id}/share`, {
        method: "POST",
        body: { user_ids: selectedUsers, permission },
      });
      setNotes((current) =>
        updateNote(
          current,
          activeNote.id,
          mergeSharedNote(activeNote, response)
        )
      );
      setShareOpen(false);
      setSelectedUsers([]);
      await loadWorkspace();
      toast.success("Page shared.");
    } catch (error) {
      toast.error(error?.message || "Page could not be shared.");
    }
  };

  const format = (command, value = null) => {
    if (!editable) return;
    document.execCommand(command, false, value);
    const editor = document.getElementById(`workspace-note-${activeNote.id}`);
    if (editor) changeContent({ currentTarget: editor });
  };

  const copyPage = async () => {
    await navigator.clipboard.writeText(htmlToText(activeNote?.content));
    toast.success("Page copied.");
  };

  const exportPdf = () => {
    const pdf = new jsPDF();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const bottomMargin = 16;
    pdf.setFontSize(18);
    pdf.text(activeNote?.title || "Untitled", 14, 18);
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(htmlToText(activeNote?.content), 180);
    let y = 30;
    for (const line of lines) {
      if (y > pageHeight - bottomMargin) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(line, 14, y);
      y += 6;
    }
    pdf.save(`${activeNote?.title || "page"}.pdf`);
  };

  const runAi = async (label, instruction) => {
    if (!editable || !activeNote) return;
    const source = htmlToText(activeNote.content);
    if (!source) return toast.error("Add some text before using AI.");
    setAiRunning(label);
    try {
      const result = await sendEirmonAiMessage({
        message: `${instruction}\n\nPage title: ${activeNote.title}\n\n${source}`,
        context: { pathname: "/rough-work" },
      });
      if (!result?.text) throw new Error("AI returned no text.");
      const content = sanitizeHtml(textToHtml(result.text));
      setNotes((current) => updateNote(current, activeNote.id, { content }));
      if (editorRef.current) editorRef.current.innerHTML = content;
      scheduleSave(activeNote.id, { content });
    } catch (error) {
      toast.error(error?.message || "AI could not update this page.");
    } finally {
      setAiRunning("");
    }
  };

  const status = saveState[activeNoteId] ?? "saved";

  return (
    <AppLayout noPadding mainClassName="workspace-notes-host">
      <div className="workspace-notes">
        <aside className="knowledge-sidebar">
          <div className="knowledge-sidebar-header">
            <div>
              <p>Workspace</p>
              <h1>Knowledge</h1>
            </div>
          </div>
          <nav className="knowledge-nav" aria-label="Knowledge sections">
            {[
              ["pages", FileText, "Pages"],
              ["meetings", Users, "Meetings"],
              ["recents", Clock3, "Recents"],
            ].map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={section === id ? "active" : ""}
                onClick={() => setSection(id)}
              >
                {createElement(icon, { size: 16 })}
                {label}
              </button>
            ))}
          </nav>
          <div className="knowledge-list-label">
            <span>{section === "pages" ? "Pages" : section}</span>
            <span>{visibleNotes.length}</span>
          </div>
          <div ref={listRef} className="knowledge-page-list">
            {loading ? (
              <div className="notes-list-state"><Loader2 className="animate-spin" size={18} /> Loading</div>
            ) : visibleNotes.length === 0 ? (
              <div className="notes-list-state">No pages here yet.</div>
            ) : (
              visibleNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  data-note-id={note.id}
                  className={`knowledge-page-row ${
                    String(note.id) === String(activeNoteId) ? "active" : ""
                  } ${!note.is_owner ? "notes-shared-page" : ""}`}
                  onClick={() => setActiveNoteId(note.id)}
                >
                  {note.is_owner ? (
                    <GripVertical className="notes-drag-handle" size={14} />
                  ) : (
                    <Users className="notes-shared-indicator" size={14} />
                  )}
                  <FileText size={15} />
                  <span>{note.title || "Untitled"}</span>
                  {note.is_owner ? (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Delete page"
                      aria-label={`Delete ${note.title || "page"}`}
                      className="notes-delete-page"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(note);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeleteTarget(note);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
          <div className="knowledge-new-page">
            <button type="button" onClick={() => setTemplateOpen((open) => !open)}>
              <Plus size={16} /> New page <ChevronDown size={14} />
            </button>
            {templateOpen ? (
              <div className="notes-popover notes-template-menu">
                {NOTE_TEMPLATES.map((template) => (
                  <button key={template.id} type="button" onClick={() => void createPage(template)}>
                    <FileText size={15} />
                    <span>{template.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="notes-document">
          {loadError ? (
            <div className="notes-error-state">
              <FileText size={28} />
              <p>{loadError}</p>
              <button type="button" onClick={() => void loadWorkspace()}>
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          ) : !loading && !activeNote ? (
            <div className="notes-empty-state">
              <FileText size={32} />
              <h2>No page selected</h2>
              <p>Create a page to start building your workspace knowledge.</p>
              <button type="button" onClick={() => setTemplateOpen(true)}>
                <Plus size={16} /> New page
              </button>
            </div>
          ) : activeNote ? (
            <>
              <header className="notes-document-header">
                <div className="notes-title-group">
                  <FileText className="notes-page-icon" size={22} />
                  <input
                    value={activeNote.title || ""}
                    onChange={(event) => changeTitle(event.target.value)}
                    onBlur={() => flushNoteSave(activeNote.id)}
                    readOnly={!editable}
                    aria-label="Page title"
                    placeholder="Untitled"
                  />
                  <IconButton
                    label={favorites.has(String(activeNote.id)) ? "Remove favorite" : "Add favorite"}
                    onClick={() =>
                      setFavorites((current) => {
                        const next = new Set(current);
                        const id = String(activeNote.id);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    active={favorites.has(String(activeNote.id))}
                  >
                    <Star size={16} fill={favorites.has(String(activeNote.id)) ? "currentColor" : "none"} />
                  </IconButton>
                  <span className="notes-access-label">{accessLabel(activeNote)}</span>
                </div>
                <div className="notes-header-actions">
                  <div className="notes-collaborators" aria-label="Page collaborators">
                    {collaborators.map((person) => (
                      <div
                        key={person.id}
                        className="notes-collaborator"
                        title={`${person.name} — ${
                          person.isOwner
                            ? "Page owner"
                            : person.permission === "edit"
                              ? "Edit access"
                              : "View access"
                        }`}
                      >
                        <span>{initials(person.name)}</span>
                        <strong>{person.name}</strong>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`notes-save-status ${status}`}
                    title={status === "failed" ? "Retry saving" : "Autosave status"}
                    onClick={() => {
                      if (status === "failed") {
                        void persistNote(activeNote.id, {
                          title: activeNote.title,
                          content: activeNote.content,
                        });
                      }
                    }}
                  >
                    {status === "saving" || status === "pending" ? (
                      <><Loader2 size={13} className="animate-spin" /> Saving</>
                    ) : status === "failed" ? (
                      <><X size={13} /> Save failed</>
                    ) : (
                      <><Check size={13} /> Saved</>
                    )}
                  </button>
                  {activeNote.is_owner ? (
                    <button className="notes-share-button" type="button" onClick={() => setShareOpen(true)}>
                      <Share2 size={15} /> Share
                    </button>
                  ) : null}
                  <div className="notes-menu-wrap">
                    <IconButton label="More actions" onClick={() => setMoreOpen((open) => !open)}>
                      <MoreHorizontal size={18} />
                    </IconButton>
                    {moreOpen ? (
                      <div className="notes-popover notes-more-menu">
                        <button type="button" onClick={() => void copyPage()}><Copy size={15} /> Copy page</button>
                        <button type="button" onClick={exportPdf}><Download size={15} /> Export PDF</button>
                        {activeNote.is_owner ? (
                          <button className="danger" type="button" onClick={() => setDeleteTarget(activeNote)}>
                            <Trash2 size={15} /> Delete page
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="notes-toolbar" role="toolbar" aria-label="Formatting toolbar">
                <div className="notes-insert-wrap">
                  <button type="button" disabled={!editable} onClick={() => setInsertOpen((open) => !open)}>
                    <Plus size={15} /> Insert
                  </button>
                  {insertOpen ? (
                    <div className="notes-popover notes-insert-menu">
                      <button type="button" onClick={() => { format("insertParagraph"); setInsertOpen(false); }}>Paragraph</button>
                      <button type="button" onClick={() => { format("formatBlock", "h2"); setInsertOpen(false); }}>Heading</button>
                      <button type="button" onClick={() => { format("insertUnorderedList"); setInsertOpen(false); }}>Bulleted list</button>
                      <button type="button" onClick={() => { format("insertOrderedList"); setInsertOpen(false); }}>Numbered list</button>
                      <button type="button" onClick={() => {
                        const url = window.prompt("Enter a URL");
                        if (url) format("createLink", url);
                        setInsertOpen(false);
                      }}>Link</button>
                    </div>
                  ) : null}
                </div>
                <span className="notes-toolbar-divider" />
                <IconButton label="Undo" disabled={!editable} onClick={() => format("undo")}><Undo2 size={16} /></IconButton>
                <IconButton label="Redo" disabled={!editable} onClick={() => format("redo")}><Redo2 size={16} /></IconButton>
                <span className="notes-toolbar-divider" />
                <IconButton label="Bold" disabled={!editable} onClick={() => format("bold")}><Bold size={16} /></IconButton>
                <IconButton label="Italic" disabled={!editable} onClick={() => format("italic")}><Italic size={16} /></IconButton>
                <IconButton label="Underline" disabled={!editable} onClick={() => format("underline")}><Underline size={16} /></IconButton>
                <IconButton label="Strikethrough" disabled={!editable} onClick={() => format("strikeThrough")}><Strikethrough size={16} /></IconButton>
                <IconButton label="Bulleted list" disabled={!editable} onClick={() => format("insertUnorderedList")}><List size={16} /></IconButton>
                <IconButton label="Numbered list" disabled={!editable} onClick={() => format("insertOrderedList")}><ListOrdered size={16} /></IconButton>
                <IconButton
                  label="Add link"
                  disabled={!editable}
                  onClick={() => {
                    const url = window.prompt("Enter a URL");
                    if (url) format("createLink", url);
                  }}
                >
                  <Link size={16} />
                </IconButton>
                <button type="button" disabled={!editable} onClick={() => format("formatBlock", "h2")}>
                  <Hash size={15} /> Heading
                </button>
                <IconButton label="AI assistant" disabled={!editable} onClick={() => setAiOpen((open) => !open)}><Sparkles size={16} /></IconButton>
                <IconButton label="Copy page" onClick={() => void copyPage()}><Copy size={16} /></IconButton>
                <IconButton label="Export PDF" onClick={exportPdf}><Download size={16} /></IconButton>
              </div>

              <div className="notes-editor-scroll">
                <div className="notes-editor-canvas">
                  <div
                    key={activeNote.id}
                    ref={editorRef}
                    id={`workspace-note-${activeNote.id}`}
                    className={`notes-rich-editor ${editable ? "" : "read-only"}`}
                    contentEditable={editable}
                    suppressContentEditableWarning
                    data-placeholder="Start typing or type / for menu"
                    onInput={changeContent}
                    onBlur={() => flushNoteSave(activeNote.id)}
                    onKeyDown={(event) => {
                      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
                        setInsertOpen(true);
                      }
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      document.execCommand(
                        "insertText",
                        false,
                        event.clipboardData.getData("text/plain")
                      );
                    }}
                    aria-label="Page content"
                  />
                </div>
              </div>

              <section className={`notes-ai-panel ${aiOpen ? "open" : ""}`}>
                <button type="button" className="notes-ai-toggle" onClick={() => setAiOpen((open) => !open)}>
                  <Bot size={17} />
                  <span>AI assistant</span>
                  {aiOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                </button>
                {aiOpen ? (
                  <div className="notes-ai-actions">
                    {AI_MODES.map(([label, prompt]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={!editable || Boolean(aiRunning)}
                        onClick={() => void runAi(label, prompt)}
                      >
                        {aiRunning === label ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </section>
      </div>

      {shareOpen && activeNote ? (
        <div className="notes-modal-backdrop" role="presentation">
          <div className="notes-modal" role="dialog" aria-modal="true" aria-labelledby="share-page-title">
            <div className="notes-modal-header">
              <div><h2 id="share-page-title">Share “{activeNote.title || "Untitled"}”</h2><p>Only people in your workspace are available.</p></div>
              <IconButton label="Close share dialog" onClick={() => setShareOpen(false)}><X size={18} /></IconButton>
            </div>
            <form onSubmit={sharePage}>
              <label>
                People
                <select
                  multiple
                  value={selectedUsers}
                  onChange={(event) =>
                    setSelectedUsers(
                      Array.from(event.target.selectedOptions, (option) => option.value)
                    )
                  }
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                  ))}
                </select>
              </label>
              <label>
                Access
                <select value={permission} onChange={(event) => setPermission(event.target.value)}>
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
              </label>
              <div className="notes-modal-actions">
                <button type="button" onClick={() => setShareOpen(false)}>Cancel</button>
                <button type="submit" className="primary" disabled={selectedUsers.length === 0}>Share page</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="notes-modal-backdrop" role="presentation">
          <div className="notes-modal notes-confirm-modal" role="alertdialog" aria-modal="true">
            <h2>Delete this page?</h2>
            <p>“{deleteTarget.title || "Untitled"}” will be permanently deleted.</p>
            <div className="notes-modal-actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="danger" onClick={() => void deletePage()}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}

export default function RoughWorkNotepad() {
  return (
    <WorkspaceNotesErrorBoundary>
      <WorkspaceNotesContent />
    </WorkspaceNotesErrorBoundary>
  );
}
