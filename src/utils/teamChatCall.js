import { startTeamChatCall } from "../api/teamChat.api";
import { unwrapApiBody } from "./unwrapApiBody";

/**
 * Start a Team Chat audio/video call. Creates a LiveKit meeting and
 * broadcasts MeetingCallIncoming so the other party rings in real time.
 */
export async function startChatCall({ channel, video = true }) {
  if (!channel?.id) {
    throw new Error("No chat selected to call.");
  }

  const response = await startTeamChatCall(
    channel.id,
    video ? "video" : "audio"
  );
  const body = unwrapApiBody(response) ?? response;
  const meeting =
    body?.meeting ?? body?.data?.meeting ?? body?.data ?? body;
  const uuid =
    meeting?.uuid ?? body?.meeting_id ?? body?.meetingId ?? body?.uuid;

  if (!uuid) {
    throw new Error("Could not start the call.");
  }

  return {
    meeting: { ...meeting, uuid },
    joinSettings: {
      camera: Boolean(video),
      microphone: true,
      selected: {},
    },
  };
}
