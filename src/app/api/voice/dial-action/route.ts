// POST /api/voice/dial-action?logId= — <Dial action> for outbound calls. Fires when the dialed
// leg ends; finalizes the log (backup to dial-status) and hangs up the browser leg.
import { applyCallUpdate, intParam } from "@/lib/calls";
import { fromTwilioStatus, normalizeOutboundFinal } from "@/lib/call-status";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { forbidden, readTwilioRequest, twiml, VoiceResponse } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const logId = new URL(req.url).searchParams.get("logId");

  if (logId) {
    try {
      const duration = intParam(p.DialCallDuration);
      const current = await db.callLog.findUnique({ where: { id: logId }, select: { answeredAt: true, duration: true } });
      let status = fromTwilioStatus(p.DialCallStatus);
      if (status) status = normalizeOutboundFinal(status, duration, Boolean(current?.answeredAt));
      await applyCallUpdate(logId, status, {
        ...(p.DialCallSid ? { childCallSid: p.DialCallSid } : {}),
        ...(duration > (current?.duration ?? 0) ? { duration } : {}),
        ...(p.ErrorCode ? { errorCode: p.ErrorCode, errorMessage: p.ErrorMessage ?? null } : {}),
        ...(!p.ErrorCode && p.DialSipResponseCode && status !== "completed" && !["200", "487"].includes(p.DialSipResponseCode)
          ? { errorCode: `SIP ${p.DialSipResponseCode}` }
          : {}),
      });
    } catch (err) {
      log.error("dial-action failed", err, { logId });
    }
  }
  const r = new VoiceResponse();
  r.hangup();
  return twiml(r.toString());
}
