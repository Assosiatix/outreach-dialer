// POST /api/voice/inbound/after-dial?logId= — <Dial action> for inbound calls.
// Answered → log completed. Not answered → missed-call alert + voicemail.
import { after } from "next/server";
import { sendMissedCallAlert } from "@/lib/alerts";
import { applyCallUpdate, intParam } from "@/lib/calls";
import { log } from "@/lib/log";
import { forbidden, readTwilioRequest, twiml } from "@/lib/twilio";
import { emptyTwiml, voicemailTwiml } from "@/lib/voice";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const logId = new URL(req.url).searchParams.get("logId");
  if (!logId) return twiml(emptyTwiml());

  try {
    const dialStatus = (p.DialCallStatus ?? "").toLowerCase();
    const callerGone = (p.CallStatus ?? "").toLowerCase() === "completed";

    if (dialStatus === "completed") {
      await applyCallUpdate(logId, "completed", {
        duration: intParam(p.DialCallDuration),
        ...(p.DialCallSid ? { childCallSid: p.DialCallSid } : {}),
      });
      return twiml(emptyTwiml());
    }

    await applyCallUpdate(logId, "missed", p.ErrorCode ? { errorCode: p.ErrorCode } : {});
    if (callerGone) {
      after(() => sendMissedCallAlert(logId, "caller_hung_up"));
      return twiml(emptyTwiml());
    }
    after(() => sendMissedCallAlert(logId, "no_answer"));
    return twiml(voicemailTwiml(logId));
  } catch (err) {
    log.error("inbound after-dial failed", err, { logId });
    after(() => sendMissedCallAlert(logId, "no_answer"));
    return twiml(voicemailTwiml(logId));
  }
}
