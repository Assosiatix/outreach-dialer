// GET /api/calls/outcome?logId=|callSid=|number= — how a call ended, for the wrap-up dialog
// (every team member). Twilio's final status arrives a second or two after hang-up.
import { apiMember, HttpError } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { explainTwilioError, isFinal, STATUS_LABEL } from "@/lib/call-status";
import { findCallForMember } from "@/lib/calls";

export const GET = jsonRoute(async (req: Request) => {
  const me = await apiMember();
  const q = new URL(req.url).searchParams;
  const call = await findCallForMember(me.id, { logId: q.get("logId"), callSid: q.get("callSid"), number: q.get("number") });
  if (!call) throw new HttpError(404, "Call not found yet");
  return {
    logId: call.id,
    status: call.status,
    label: STATUS_LABEL[call.status],
    finished: isFinal(call.status),
    connected: call.status === "completed" || Boolean(call.answeredAt),
    problem: explainTwilioError(call.errorCode) ?? call.errorMessage ?? null,
  };
});
