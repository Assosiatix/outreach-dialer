// POST /api/voice/status — call-level Status Callback (set on the TwiML App AND on each number).
// Safety net: when the parent call ends, any log still in a transient state gets a final status,
// so nothing is silently dropped (e.g. inbound caller hangs up while browsers are ringing).
import { after } from "next/server";
import { sendMissedCallAlert } from "@/lib/alerts";
import { applyCallUpdate, findLogByCallSid } from "@/lib/calls";
import { fromTwilioStatus, isFinal } from "@/lib/call-status";
import { log } from "@/lib/log";
import { forbidden, readTwilioRequest } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();

  try {
    const call = await findLogByCallSid(p.CallSid);
    const twStatus = fromTwilioStatus(p.CallStatus);
    if (!call || !twStatus || !isFinal(twStatus) || isFinal(call.status)) return new Response(null, { status: 204 });

    const errorExtra = p.ErrorCode ? { errorCode: p.ErrorCode, errorMessage: p.ErrorMessage ?? null } : {};
    if (call.direction === "inbound") {
      if (call.answeredAt) {
        await applyCallUpdate(call.id, "completed", errorExtra);
      } else {
        await applyCallUpdate(call.id, "missed", errorExtra);
        after(() => sendMissedCallAlert(call.id, "caller_hung_up"));
      }
    } else {
      // Outbound browser leg ended without the dialed leg reporting a result.
      const final = call.answeredAt ? "completed" : twStatus === "completed" ? "canceled" : twStatus;
      await applyCallUpdate(call.id, final, errorExtra);
    }
  } catch (err) {
    log.error("status callback failed", err, { callSid: p.CallSid });
  }
  return new Response(null, { status: 204 });
}
