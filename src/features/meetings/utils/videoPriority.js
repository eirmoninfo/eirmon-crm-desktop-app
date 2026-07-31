export const MAX_REMOTE_VIDEO_SUBSCRIPTIONS = 6;

/**
 * Returns remote participant identities in subscription order.
 * Pinned and actively speaking people win, followed by visible people.
 */
export function selectPriorityParticipants(
  participants,
  { pinnedIdentity = null, activeSpeakerIds = [], visibleIds = [] } = {},
  limit = MAX_REMOTE_VIDEO_SUBSCRIPTIONS
) {
  const active = new Set(activeSpeakerIds);
  const visible = new Set(visibleIds);
  return [...participants]
    .filter((participant) => participant && !participant.isLocal)
    .sort((a, b) => {
      const score = (participant) =>
        (participant.identity === pinnedIdentity ? 100 : 0) +
        (active.has(participant.identity) ? 50 : 0) +
        (visible.has(participant.identity) ? 10 : 0) +
        (participant.isSpeaking ? 5 : 0);
      return score(b) - score(a);
    })
    .slice(0, Math.max(0, limit))
    .map((participant) => participant.identity);
}

