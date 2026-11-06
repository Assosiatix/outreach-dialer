// POST /api/voice/recording?logId= — recordingStatusCallback for connected calls (Phase 3).
import { applyCallUpdate, intParam } from "@/lib/calls";
import { log } from "@/lib/log";
import { forbidden, readTwilioRequest } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const logId = new URL(req.url).searchParams.get("logId");
  if (logId && p.RecordingStatus === "completed" && p.RecordingSid) {
    try {
      await applyCallUpdate(logId, null, {
        recordingSid: p.RecordingSid,
        recordingUrl: p.RecordingUrl ?? null,
        recordingDuration: intParam(p.RecordingDuration),
      });
    } catch (err) {
      log.error("recording callback failed", err, { logId });
    }
  }
  return new Response(null, { status: 204 });
}
