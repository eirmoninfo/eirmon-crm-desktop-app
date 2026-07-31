import test from "node:test";
import assert from "node:assert/strict";
import {
  accessLabel,
  canEditNote,
  createDebouncedSaveQueue,
  getNoteCollaborators,
  mergeSharedNote,
  selectAfterDelete,
  updateNote,
} from "./workspaceNotesModel.js";

test("page switching helpers preserve each page content", () => {
  const notes = [{ id: 1, content: "one" }, { id: 2, content: "two" }];
  assert.equal(updateNote(notes, 1, { content: "changed" })[1].content, "two");
  assert.equal(selectAfterDelete(notes, 1, 1), 2);
});

test("permissions distinguish owner, editor, and viewer", () => {
  assert.equal(canEditNote({ is_owner: true, permission: "view" }), true);
  assert.equal(canEditNote({ is_owner: false, permission: "edit" }), true);
  assert.equal(canEditNote({ is_owner: false, permission: "view" }), false);
  assert.equal(accessLabel({ is_owner: false, permission: "view" }), "View only");
});

test("collaborators include shared users and the owner on shared pages", () => {
  const collaborators = getNoteCollaborators({
    id: 7,
    is_owner: false,
    owner: { id: 1, name: "Owner" },
    shared_users: [
      { id: 2, name: "Editor", pivot: { permission: "edit" } },
      { id: 3, name: "Viewer", permission: "view" },
    ],
  });
  assert.deepEqual(
    collaborators.map(({ name, permission }) => ({ name, permission })),
    [
      { name: "Owner", permission: "owner" },
      { name: "Editor", permission: "edit" },
      { name: "Viewer", permission: "view" },
    ]
  );
});

test("share responses refresh collaborator data when backend returns a note", () => {
  const merged = mergeSharedNote(
    { id: 1, shared_users: [] },
    { note: { id: 1, shared_users: [{ id: 4, name: "New user" }] } }
  );
  assert.equal(merged.shared_users[0].name, "New user");
});

test("read-only state blocks both title and content edits", () => {
  const viewer = { is_owner: false, permission: "view" };
  assert.equal(canEditNote(viewer), false);
});

test("autosave debounce merges title and content edits for a page", async () => {
  const calls = [];
  const queue = createDebouncedSaveQueue(
    (noteId, patch) => calls.push([noteId, patch]),
    5
  );
  queue.schedule(1, { title: "Updated title" });
  queue.schedule(1, { content: "latest" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(calls, [
    [1, { title: "Updated title", content: "latest" }],
  ]);
  queue.cancelAll();
});
