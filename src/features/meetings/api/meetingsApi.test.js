import test from "node:test";
import assert from "node:assert/strict";
import {
  createMeeting,
  endMeeting,
  getConnectionDetails,
  leaveMeeting,
  listMeetings,
} from "./meetingsApi.js";

const calls = [];
globalThis.localStorage = {
  getItem: (key) => key === "auth_token" ? "sanctum-test-token" : null,
};
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  return new Response(JSON.stringify({ success: true, data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

test.beforeEach(() => calls.splice(0));

test("meeting list uses the authenticated v1 endpoint", async () => {
  await listMeetings();
  assert.match(calls[0].url, /\/v1\/meetings$/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer sanctum-test-token");
  assert.equal(calls[0].options.headers.Accept, "application/json");
});

test("meeting mutations use POST JSON without exposing credentials in payload", async () => {
  await createMeeting({ title: "Sync", participant_ids: [2] });
  await getConnectionDetails("meeting id");
  await leaveMeeting("meeting id");
  await endMeeting("meeting id");

  assert.equal(calls.length, 4);
  calls.forEach(({ options }) => assert.equal(options.method, "POST"));
  assert.equal(JSON.parse(calls[0].options.body).title, "Sync");
  assert.match(calls[1].url, /meeting%20id\/connection-details$/);
  assert.doesNotMatch(calls.map(({ options }) => options.body).join(""), /sanctum-test-token/);
});

