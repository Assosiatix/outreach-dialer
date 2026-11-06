// POST /api/sms/status — delivery status for outbound SMS.
import { db } from "@/lib/db";
import { forbidden, readTwilioRequest } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  if (p.MessageSid) {
    await db.smsMessage
      .updateMany({
        where: { messageSid: p.MessageSid },
        data: { status: p.MessageStatus ?? "unknown", ...(p.ErrorCode ? { errorCode: p.ErrorCode } : {}) },
      })
      .catch(() => {});
  }
  return new Response(null, { status: 204 });
}
