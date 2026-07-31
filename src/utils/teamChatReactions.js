export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function normalizeReactions(message) {
  const raw = message?.reactions ?? message?.message_reactions ?? [];
  if (!Array.isArray(raw)) return [];

  const groups = new Map();
  for (const reaction of raw) {
    const emoji = reaction?.emoji ?? reaction?.reaction ?? reaction?.value;
    if (!emoji) continue;
    const users = Array.isArray(reaction.users)
      ? reaction.users
      : reaction.user
        ? [reaction.user]
        : reaction.user_id != null
          ? [{ id: reaction.user_id, name: reaction.user_name }]
          : [];
    const current = groups.get(emoji) ?? { emoji, users: [], count: 0 };
    for (const user of users) {
      if (!current.users.some((item) => String(item.id) === String(user.id))) {
        current.users.push(user);
      }
    }
    current.count += Number(reaction.count ?? (users.length || 1));
    groups.set(emoji, current);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    count: Math.max(group.count, group.users.length),
  }));
}

export function toggleReactionLocally(message, emoji, user) {
  const reactions = normalizeReactions(message);
  const group = reactions.find((item) => item.emoji === emoji);
  const hasReacted = group?.users.some((item) => String(item.id) === String(user.id));

  const next = reactions
    .map((item) => {
      if (item.emoji !== emoji) return item;
      const users = hasReacted
        ? item.users.filter((entry) => String(entry.id) !== String(user.id))
        : [...item.users, user];
      return { ...item, users, count: Math.max(0, item.count + (hasReacted ? -1 : 1)) };
    })
    .filter((item) => item.count > 0);

  if (!group) next.push({ emoji, users: [user], count: 1 });
  return { ...message, reactions: next };
}

export function isEmojiOnlyMessage(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const withoutEmoji = text
    .replace(/(?:[0-9#*]\uFE0F?\u20E3)/gu, "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}]/gu, "")
    .replace(/\uFE0F/gu, "")
    .replace(/\u200D/gu, "")
    .replace(/\s/gu, "");
  return withoutEmoji.length === 0;
}
