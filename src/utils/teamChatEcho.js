import { getEcho, refreshEchoAuth } from "./echo";

let activeSubscription = null;
let userSubscription = null;
let globalChannelSubscriptions = [];

const MESSAGE_EVENTS = [
  ".MessageSent",
  ".TeamChatIncoming",
];

const TYPING_EVENTS = [
  ".UserTyping",
];

const REACTION_EVENTS = [
  ".MessageReactionUpdated",
];

const READ_EVENTS = [
  ".MessageRead",
  "MessageRead",
];

const DELIVERED_EVENTS = [
  ".MessageDelivered",
  "MessageDelivered",
];

const TASK_ASSIGNED_EVENTS = [
  ".task.assigned",
  "task.assigned",
  ".TaskAssigned",
  "TaskAssigned",
];

const TASK_ACTIVITY_EVENTS = [
  ".task.activity",
  "task.activity",
  ".TaskActivityNotified",
  "TaskActivityNotified",
];

const TASK_UPDATED_EVENTS = [
  ".task.updated",
  "task.updated",
  ".TaskUpdated",
  "TaskUpdated",
];

const MEETING_CALL_EVENTS = [
  ".MeetingCallIncoming",
  "MeetingCallIncoming",
];

function bindEvents(channel, handlers) {
  const bindings = [];
  const recentMessageKeys = new Set();

  const wrapMessageHandler = (handler) => (payload) => {
    const message =
      payload?.message ??
      payload?.data?.message ??
      payload?.data ??
      payload;
    const key =
      message?.id != null
        ? String(message.id)
        : message?.message_id != null
          ? String(message.message_id)
          : null;

    if (key) {
      if (recentMessageKeys.has(key)) return;
      recentMessageKeys.add(key);
      if (recentMessageKeys.size > 300) {
        for (const existing of [...recentMessageKeys].slice(0, 150)) {
          recentMessageKeys.delete(existing);
        }
      }
    }

    handler(payload);
  };

  if (handlers.onMessage) {
    const onMessage = wrapMessageHandler(handlers.onMessage);
    for (const ev of MESSAGE_EVENTS) {
      channel.listen(ev, onMessage);
      bindings.push([ev, onMessage]);
    }
  }
  if (handlers.onTyping) {
    for (const ev of TYPING_EVENTS) {
      const callback = (e) => handlers.onTyping(e);
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
  if (handlers.onMessageRead) {
    for (const ev of READ_EVENTS) {
      const callback = (payload) => handlers.onMessageRead(payload);
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  if (handlers.onMessageDelivered) {
    for (const ev of DELIVERED_EVENTS) {
      const callback = (payload) => handlers.onMessageDelivered(payload);
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
  if (handlers.onTaskActivity) {
    for (const ev of TASK_ACTIVITY_EVENTS) {
      const callback = (payload) => handlers.onTaskActivity(payload);
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  if (handlers.onTaskUpdated) {
    for (const ev of TASK_UPDATED_EVENTS) {
      const callback = (payload) => handlers.onTaskUpdated(payload);
      channel.listen(ev, callback);
      bindings.push([ev, callback]);
    }
  }
  if (handlers.onMeetingCallIncoming) {
    for (const ev of MEETING_CALL_EVENTS) {
      const callback = (payload) => handlers.onMeetingCallIncoming(payload);
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
        onMessageRead: (payload) => handlers.onMessageRead?.(payload, channelId),
        onMessageDelivered: (payload) =>
          handlers.onMessageDelivered?.(payload, channelId),
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
