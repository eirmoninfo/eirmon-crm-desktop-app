import { getEcho, refreshEchoAuth } from "./echo";

let activeSubscription = null;
let userSubscription = null;
let globalChannelSubscriptions = [];

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

const REACTION_EVENTS = [
  ".MessageReactionUpdated",
  "MessageReactionUpdated",
  ".message.reaction.updated",
  "message.reaction.updated",
  ".reaction.updated",
  "reaction.updated",
];

const TASK_ASSIGNED_EVENTS = [
  ".task.assigned",
  "task.assigned",
  ".TaskAssigned",
  "TaskAssigned",
];

function bindEvents(channel, handlers) {
  const bindings = [];
  if (handlers.onMessage) {
    for (const ev of MESSAGE_EVENTS) {
      const callback = (e) => {
        console.log(`[TeamChat] Incoming event:${ev}`, e);
        handlers.onMessage(e);
      };
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  if (handlers.onTyping) {
    for (const ev of TYPING_EVENTS) {
      const callback = (e) => {
        console.log(`[TeamChat] Typing event:${ev}`, e);
        handlers.onTyping(e);
      };
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  if (handlers.onReaction) {
    for (const ev of REACTION_EVENTS) {
      const callback = (payload) => handlers.onReaction(payload);
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  if (handlers.onTaskAssigned) {
    for (const ev of TASK_ASSIGNED_EVENTS) {
      const callback = (payload) => handlers.onTaskAssigned(payload);
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  return bindings;
}

function stopBindings(channel, bindings = []) {
  if (typeof channel?.stopListening !== "function") return;
  for (const [event, callback] of bindings) {
    channel.stopListening(event, callback);
  }
}

export function subscribeTeamChatUser(userId, handlers = {}) {
  if (userId == null) return false;
  const echo = getEcho();
  if (!echo) return false;

  refreshEchoAuth();
  const channelName = `user.${userId}`;
  const channel = echo.private(channelName);
  const bindings = bindEvents(channel, handlers);
  userSubscription = { channel, channelName, bindings };
  console.log(`[TeamChat] Subscribed private ${channelName} for global messages`);
  return true;
}

export function leaveTeamChatUser() {
  if (!userSubscription) return;
  const { channel, bindings } = userSubscription;
  stopBindings(channel, bindings);
  userSubscription = null;
}

export function subscribeTeamChatGlobalChannels(channelIds, handlers = {}) {
  leaveTeamChatGlobalChannels();
  const echo = getEcho();
  if (!echo) return false;
  refreshEchoAuth();

  globalChannelSubscriptions = [...new Set(channelIds.map(String))]
    .filter(Boolean)
    .map((channelId) => {
      const channelName = `channel.${channelId}`;
      const channel = echo.join(channelName);
      const bindings = bindEvents(channel, {
        onMessage: (payload) => handlers.onMessage?.(payload, channelId),
      });
      return { channel, channelName, bindings };
    });
  return globalChannelSubscriptions.length > 0;
}

export function leaveTeamChatGlobalChannels() {
  for (const { channel, bindings } of globalChannelSubscriptions) {
    stopBindings(channel, bindings);
  }
  globalChannelSubscriptions = [];
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
    const bindings = bindEvents(ch, handlers);
    if (typeof handlers.onPresence === "function") {
      ch.here((users) => handlers.onPresence(users));
    }
    ch.subscribed(() => {
      console.log(`[TeamChat] Subscribed presence ${channelName}`);
    });
    ch.error((err) => {
      console.error(`[TeamChat] Presence error ${channelName}`, err);
    });
    activeSubscription = {
      type: "presence",
      channelId,
      channelName,
      channel: ch,
      bindings,
    };
    console.log(`[TeamChat] Joined presence ${channelName}`);
    return true;
  } catch (e) {
    console.warn("[TeamChat] presence join failed, trying private:", e?.message);
  }

  try {
    const ch = echo.private(channelName);
    const bindings = bindEvents(ch, handlers);
    ch.subscribed(() => {
      console.log(`[TeamChat] Subscribed private ${channelName}`);
    });
    ch.error((err) => {
      console.error(`[TeamChat] Private error ${channelName}`, err);
    });
    activeSubscription = {
      type: "private",
      channelId,
      channelName,
      channel: ch,
      bindings,
    };
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
    stopBindings(activeSubscription.channel, activeSubscription.bindings);
  } catch (e) {
    console.warn("[TeamChat] leave channel:", e?.message || e);
  }
  activeSubscription = null;
}
