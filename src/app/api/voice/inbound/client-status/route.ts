// POST /api/voice/inbound/client-status?logId= — <Client statusCallback>: tells us which team
// member answered an inbound call.
import { applyCallUpdate } from "@/lib/calls";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { forbidden, memberIdFromIdentity, readTwilioRequest } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const logId = new URL(req.url).searchParams.get("logId");
  if (!logId) return new Response(null, { status: 204 });

  try {
    const status = (p.CallStatus ?? "").toLowerCase();
    if (status === "in-progress" || status === "answered") {
      const memberId = memberIdFromIdentity(p.To ?? p.Called);
      const member = memberId ? await db.teamMember.findUnique({ where: { id: memberId }, select: { id: true } }) : null;
      await applyCallUpdate(logId, "in_progress", {
        childCallSid: p.CallSid,
        ...(member ? { teamMember: { connect: { id: member.id } } } : {}),
      });
    }
  } catch (err) {
    log.error("inbound client-status failed", err, { logId });
  }
  return new Response(null, { status: 204 });
}
