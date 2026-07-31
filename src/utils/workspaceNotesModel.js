export const NOTE_TEMPLATES = [
  {
    id: "scratchpad",
    name: "My scratchpad",
    title: "My scratchpad",
    content: "<p></p>",
  },
  {
    id: "weekly",
    name: "Weekly planning",
    title: "Weekly planning",
    content:
      "<h2>Priorities</h2><ul><li></li></ul><h2>Plan</h2><p></p><h2>Notes</h2><p></p>",
  },
  {
    id: "meeting",
    name: "Meeting notes",
    title: "Meeting notes",
    content:
      "<h2>Attendees</h2><p></p><h2>Agenda</h2><ul><li></li></ul><h2>Decisions</h2><ul><li></li></ul><h2>Action items</h2><ul><li></li></ul>",
  },
  {
    id: "resources",
    name: "Key resources",
    title: "Key resources",
    content: "<h2>Links</h2><ul><li></li></ul><h2>Reference notes</h2><p></p>",
  },
  { id: "blank", name: "Blank page", title: "Untitled", content: "" },
];

export function canEditNote(note) {
  if (!note) return false;
  return Boolean(
    note.is_owner ||
      note.permission === "edit" ||
      note.access === "edit" ||
      note.can_edit === true
  );
}

export function accessLabel(note) {
  if (!note) return "";
  if (note.is_owner) return "Private page";
  return canEditNote(note) ? "Can edit" : "View only";
}

function normalizePerson(person, permission, isOwner = false) {
  const user = person?.user ?? person;
  if (!user || user.id == null) return null;
  return {
    id: user.id,
    name: user.name ?? user.email ?? `User ${user.id}`,
    email: user.email ?? "",
    permission: isOwner ? "owner" : permission ?? person.permission ?? "view",
    isOwner,
  };
}

export function getNoteCollaborators(note) {
  if (!note) return [];
  const candidates =
    note.shared_users ??
    note.shared_with ??
    note.collaborators ??
    note.shares ??
    note.users ??
    [];
  const result = [];
  const seen = new Set();

  if (!note.is_owner) {
    const owner = normalizePerson(
      note.owner ?? note.shared_by_user ?? note.created_by_user,
      "owner",
      true
    );
    if (owner) {
      result.push(owner);
      seen.add(String(owner.id));
    } else if (note.shared_by) {
      result.push({
        id: `owner-${note.id}`,
        name: String(note.shared_by),
        email: "",
        permission: "owner",
        isOwner: true,
      });
    }
  }

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const person = normalizePerson(
      candidate,
      candidate.permission ?? candidate.pivot?.permission
    );
    if (!person || seen.has(String(person.id))) continue;
    seen.add(String(person.id));
    result.push(person);
  }
  return result;
}

export function updateNote(notes, noteId, patch) {
  return notes.map((note) =>
    String(note.id) === String(noteId) ? { ...note, ...patch } : note
  );
}

export function selectAfterDelete(notes, deletedId, activeId) {
  if (String(activeId) !== String(deletedId)) return activeId;
  const index = notes.findIndex((note) => String(note.id) === String(deletedId));
  return notes[index + 1]?.id ?? notes[index - 1]?.id ?? null;
}

export function mergeSharedNote(note, shareResponse) {
  const returned =
    shareResponse?.note ?? shareResponse?.data?.note ?? shareResponse?.data;
  return returned?.id ? { ...note, ...returned } : note;
}

export function createDebouncedSaveQueue(save, delay = 800) {
  const timers = new Map();
  const patches = new Map();
  return {
    schedule(noteId, patch) {
      const current = timers.get(noteId);
      if (current) clearTimeout(current);
      patches.set(noteId, { ...(patches.get(noteId) || {}), ...patch });
      timers.set(
        noteId,
        setTimeout(() => {
          timers.delete(noteId);
          const pending = patches.get(noteId);
          patches.delete(noteId);
          void save(noteId, pending);
        }, delay)
      );
    },
    cancelAll() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      patches.clear();
    },
  };
}
