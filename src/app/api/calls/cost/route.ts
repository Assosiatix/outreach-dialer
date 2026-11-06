// GET /api/calls/cost?logId=|callSid=|number= — cost of a call (admin only). Polled by the
// wrap-up dialog: returns the estimate right away and tries Twilio's actual price on each poll.
import { apiMember, HttpError } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { isFinal } from "@/lib/call-status";
import { billedMinutes } from "@/lib/cost-math";
import { estimateAndStore, fetchActualCost } from "@/lib/costs";
import { db } from "@/lib/db";

export const GET = jsonRoute(async (req: Request) => {
  const me = await apiMember();
  if (me.role !== "admin") throw new HttpError(403, "Admins only");
  const q = new URL(req.url).searchParams;
  const logId = q.get("logId");
  const callSid = q.get("callSid");
  const number = q.get("number");

  let call = logId
    ? await db.callLog.findUnique({ where: { id: logId } })
    : callSid
      ? await db.callLog.findFirst({ where: { OR: [{ callSid }, { childCallSid: callSid }] } })
      : number
        ? await db.callLog.findFirst({
            where: { teamMemberId: me.id, direction: "outbound", toNumber: number, startedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
            orderBy: { startedAt: "desc" },
          })
        : null;
  if (!call) throw new HttpError(404, "Call not found yet");

  if (isFinal(call.status) && call.costStatus !== "final") {
    if (call.costStatus === "none") await estimateAndStore(call.id);
    // Twilio needs a few seconds after hang-up to price the call; don't hammer it.
    const ended = call.endedAt ? Date.now() - call.endedAt.getTime() : 0;
    const checked = call.costCheckedAt ? Date.now() - call.costCheckedAt.getTime() : Infinity;
    if (ended > 15_000 && checked > 10_000) await fetchActualCost(call.id).catch(() => false);
    call = (await db.callLog.findUnique({ where: { id: call.id } }))!;
  }

  return {
    status: call.status,
    finished: isFinal(call.status),
    costStatus: call.costStatus,
    rateMicros: call.rateMicros,
    billedMinutes: billedMinutes(call.duration),
    callMicros: call.costCallMicros,
    clientMicros: call.costClientMicros,
    recordingMicros: call.costRecordingMicros,
    totalMicros: call.costTotalMicros,
  };
});
