import { getEcho, refreshEchoAuth } from "./echo";

let activeSubscription = null;

const MESSAGE_EVENTS = [
  ".MessageSent",
  "MessageSent",
  ".message.sent",
  "message.sent",
];

const TYPING_EVENTS = [".UserTyping", "UserTyping", ".user.typing", "user.typing"];

function bindEvents(channel, handlers) {
  if (handlers.onMessage) {
    for (const ev of MESSAGE_EVENTS) {
      channel.listen(ev, (e) => handlers.onMessage(e));
    }
  }
  if (handlers.onTyping) {
    for (const ev of TYPING_EVENTS) {
      channel.listen(ev, (e) => handlers.onTyping(e));
    }
  }
}

/**
 * Subscribe to team chat channel (presence `channel.{id}` per API spec).
 * Falls back to private channel if join is unavailable.
 */
export function subscribeTeamChatChannel(channelId, handlers = {}) {
  leaveTeamChatChannel();

  const echo = getEcho();
  if (!echo || channelId == null) {
    console.warn("[TeamChat] Echo not configured — using poll fallback only");
    return false;
  }

  refreshEchoAuth();
  const channelName = `channel.${channelId}`;

  try {
    const ch = echo.join(channelName);
    bindEvents(ch, handlers);
    if (typeof handlers.onPresence === "function") {
      ch.here((users) => handlers.onPresence(users));
    }
    activeSubscription = { type: "presence", channelId, channelName };
    console.log(`[TeamChat] Joined presence ${channelName}`);
    return true;
  } catch (e) {
    console.warn("[TeamChat] presence join failed, trying private:", e?.message);
  }

  try {
    const ch = echo.private(channelName);
    bindEvents(ch, handlers);
    activeSubscription = { type: "private", channelId, channelName };
    console.log(`[TeamChat] Subscribed private ${channelName}`);
    return true;
  } catch (e2) {
    console.warn("[TeamChat] private subscribe failed:", e2?.message);
    activeSubscription = null;
    return false;
  }
}

export function leaveTeamChatChannel() {
  if (!activeSubscription) return;
  try {
    const echo = getEcho();
    if (echo) echo.leave(activeSubscription.channelName);
  } catch (e) {
    console.warn("[TeamChat] leave channel:", e?.message || e);
  }
  activeSubscription = null;
}
