// POST /api/voice/dial-status?logId= — <Number statusCallback> for the dialed (PSTN) leg of an
// outbound call: initiated → ringing → answered → completed (with final CallStatus + duration).
import { applyCallUpdate, intParam } from "@/lib/calls";
import { fromTwilioStatus, normalizeOutboundFinal } from "@/lib/call-status";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { forbidden, readTwilioRequest } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const logId = new URL(req.url).searchParams.get("logId");
  if (!logId) return new Response("missing logId", { status: 400 });

  try {
    let status = fromTwilioStatus(p.CallStatus);
    const duration = intParam(p.CallDuration);
    const extra: Parameters<typeof applyCallUpdate>[2] = { childCallSid: p.CallSid };
    if (p.ErrorCode) {
      extra.errorCode = p.ErrorCode;
      extra.errorMessage = p.ErrorMessage ?? null;
    } else if (p.SipResponseCode && !["200", "487"].includes(p.SipResponseCode) && status && status !== "completed" && status !== "in_progress") {
      // The carrier's answer for an unconnected call (404 no such number, 486 busy, 603 declined…).
      // 487 = we hung up ourselves; not a problem worth showing.
      extra.errorCode = `SIP ${p.SipResponseCode}`;
    }
    if (status && ["completed", "no_answer", "busy", "failed", "canceled"].includes(status)) {
      const current = await db.callLog.findUnique({ where: { id: logId }, select: { answeredAt: true } });
      status = normalizeOutboundFinal(status, duration, Boolean(current?.answeredAt));
      extra.duration = duration;
    }
    await applyCallUpdate(logId, status, extra);
  } catch (err) {
    log.error("dial-status failed", err, { logId });
  }
  return new Response(null, { status: 204 });
}
