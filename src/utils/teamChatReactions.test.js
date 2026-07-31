import assert from "node:assert/strict";
import test from "node:test";
import {
  isEmojiOnlyMessage,
  normalizeReactions,
  toggleReactionLocally,
} from "./teamChatReactions.js";

test("recognizes emoji-only messages including joined and flag emoji", () => {
  assert.equal(isEmojiOnlyMessage("😀 ❤️ 👨‍👩‍👧‍👦 🇮🇳"), true);
  assert.equal(isEmojiOnlyMessage("hello 😀"), false);
  assert.equal(isEmojiOnlyMessage(""), false);
});

test("normalizes and groups flat reaction payloads", () => {
  const groups = normalizeReactions({
    reactions: [
      { emoji: "👍", user_id: 1, user_name: "A" },
      { emoji: "👍", user_id: 2, user_name: "B" },
      { emoji: "❤️", user: { id: 1, name: "A" } },
    ],
  });
  assert.deepEqual(groups.map(({ emoji, count }) => ({ emoji, count })), [
    { emoji: "👍", count: 2 },
    { emoji: "❤️", count: 1 },
  ]);
});

test("toggles a user's reaction without duplicates", () => {
  const user = { id: 7, name: "A" };
  const added = toggleReactionLocally({ id: 1 }, "👍", user);
  assert.equal(added.reactions[0].count, 1);
  const removed = toggleReactionLocally(added, "👍", user);
  assert.deepEqual(removed.reactions, []);
});
