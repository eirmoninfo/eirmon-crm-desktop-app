import { getEcho, refreshEchoAuth } from "./echo";

let activeSubscription = null;

const MESSAGE_EVENTS = [
  ".TeamChatIncoming",
  "TeamChatIncoming",
  ".MessageSent",
  "MessageSent",
  ".message.sent",
  "message.sent",
  ".message.created",
  "message.created",
  ".message.posted",
  "message.posted",
  ".team_chat_message_sent",
  "team_chat_message_sent",
  ".TeamChatMessageSent",
  "TeamChatMessageSent",
];

const TYPING_EVENTS = [
  ".UserTyping",
  "UserTyping",
  ".user.typing",
  "user.typing",
  ".typing",
  "typing",
];

function bindEvents(channel, handlers) {
  if (handlers.onMessage) {
    for (const ev of MESSAGE_EVENTS) {
      channel.listen(ev, (e) => {
        console.log(`[TeamChat] Incoming event:${ev}`, e);
        handlers.onMessage(e);
      });
    }
  }
  if (handlers.onTyping) {
    for (const ev of TYPING_EVENTS) {
      channel.listen(ev, (e) => {
        console.log(`[TeamChat] Typing event:${ev}`, e);
        handlers.onTyping(e);
      });
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
  const userChannelName = `user.${localStorage.getItem("user_id") || localStorage.getItem("user") || ""}`;

  try {
    const ch = echo.join(channelName);
    bindEvents(ch, handlers);
    if (typeof handlers.onPresence === "function") {
      ch.here((users) => handlers.onPresence(users));
    }
    ch.subscribed(() => {
      console.log(`[TeamChat] Subscribed presence ${channelName}`);
    });
    ch.error((err) => {
      console.error(`[TeamChat] Presence error ${channelName}`, err);
    });
    activeSubscription = { type: "presence", channelId, channelName };
    console.log(`[TeamChat] Joined presence ${channelName}`);
    return true;
  } catch (e) {
    console.warn("[TeamChat] presence join failed, trying private:", e?.message);
  }

  try {
    const ch = echo.private(channelName);
    bindEvents(ch, handlers);
    ch.subscribed(() => {
      console.log(`[TeamChat] Subscribed private ${channelName}`);
    });
    ch.error((err) => {
      console.error(`[TeamChat] Private error ${channelName}`, err);
    });
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
