// POST /api/sms/inbound — Messaging webhook of our numbers: store replies against the contact.
import { contactForNumber } from "@/lib/calls";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { forbidden, MessagingResponse, readTwilioRequest, twiml } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  try {
    const contact = await contactForNumber(p.From);
    await db.smsMessage.upsert({
      where: { messageSid: p.MessageSid },
      create: {
        messageSid: p.MessageSid,
        direction: "inbound",
        contactId: contact?.id,
        fromNumber: p.From ?? "",
        toNumber: p.To ?? "",
        body: p.Body ?? "",
        status: "received",
      },
      update: {},
    });
  } catch (err) {
    log.error("inbound sms failed", err, { sid: p.MessageSid });
  }
  return twiml(new MessagingResponse().toString());
}
