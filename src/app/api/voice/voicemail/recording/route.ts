// POST /api/voice/voicemail/recording?logId= — voicemail recording is ready.
// missed → voicemail (with recording) and an email alert with a link to listen.
import { after } from "next/server";
import { sendVoicemailAlert } from "@/lib/alerts";
import { applyCallUpdate, intParam } from "@/lib/calls";
import { log } from "@/lib/log";
import { forbidden, readTwilioRequest } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const logId = new URL(req.url).searchParams.get("logId");
  if (!logId || p.RecordingStatus !== "completed" || !p.RecordingSid) return new Response(null, { status: 204 });

  try {
    const seconds = intParam(p.RecordingDuration);
    // Under 2s is a hang-up at the beep, not a message: keep the call as "missed".
    const updated = await applyCallUpdate(logId, seconds >= 2 ? "voicemail" : null, {
      recordingSid: p.RecordingSid,
      recordingUrl: p.RecordingUrl ?? null,
      recordingDuration: seconds,
    });
    if (updated?.status === "voicemail") after(() => sendVoicemailAlert(logId));
  } catch (err) {
    log.error("voicemail recording failed", err, { logId });
  }
  return new Response(null, { status: 204 });
}
