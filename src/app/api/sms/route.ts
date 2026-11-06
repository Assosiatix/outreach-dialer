// POST /api/sms — send an SMS follow-up to a contact (Phase 3).
import { z } from "zod";
import { apiMember, HttpError } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { pickSmsSender } from "@/lib/numbers";
import { twilioClient, twilioConfigured, webhookUrl } from "@/lib/twilio";

const Body = z.object({ contactId: z.string(), body: z.string().trim().min(1).max(1200) });

export const POST = jsonRoute(async (req: Request) => {
  const member = await apiMember();
  const { contactId, body } = Body.parse(await req.json());
  if (!twilioConfigured()) throw new HttpError(503, "Twilio is not configured.");

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new HttpError(404, "Contact not found");
  const from = await pickSmsSender(contact.phoneNumber);
  if (!from) throw new HttpError(400, "No SMS-capable number. Mark one as SMS-enabled in Settings → Numbers.");

  const row = await db.smsMessage.create({
    data: { contactId, teamMemberId: member.id, direction: "outbound", fromNumber: from, toNumber: contact.phoneNumber, body },
  });
  try {
    const msg = await twilioClient().messages.create({
      to: contact.phoneNumber,
      from,
      body,
      statusCallback: webhookUrl("/api/sms/status"),
    });
    await db.smsMessage.update({ where: { id: row.id }, data: { messageSid: msg.sid, status: msg.status } });
    await db.contact.update({ where: { id: contactId }, data: { lastContactedAt: new Date() } });
    return { ok: true, id: row.id, status: msg.status };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    await db.smsMessage.update({
      where: { id: row.id },
      data: { status: "failed", errorCode: e.code ? String(e.code) : null },
    });
    log.error("sms send failed", err, { contactId });
    throw new HttpError(502, `SMS failed: ${e.message ?? "unknown error"}`);
  }
});
