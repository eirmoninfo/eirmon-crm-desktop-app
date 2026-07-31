import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REMOTE_VIDEO_SUBSCRIPTIONS,
  selectPriorityParticipants,
} from "./videoPriority.js";

const participant = (identity, extra = {}) => ({ identity, isLocal: false, ...extra });

test("never selects more than six remote videos", () => {
  const people = Array.from({ length: 12 }, (_, index) => participant(`user-${index}`));
  assert.equal(selectPriorityParticipants(people).length, MAX_REMOTE_VIDEO_SUBSCRIPTIONS);
});

test("prioritizes pinned and active speakers", () => {
  const people = ["a", "b", "c", "d"].map((id) => participant(id));
  const selected = selectPriorityParticipants(people, {
    pinnedIdentity: "d",
    activeSpeakerIds: ["c"],
  }, 2);
  assert.deepEqual(selected, ["d", "c"]);
});

test("does not select local participant video", () => {
  const people = [participant("me", { isLocal: true }), participant("other")];
  assert.deepEqual(selectPriorityParticipants(people), ["other"]);
});

