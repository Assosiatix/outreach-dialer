// POST /api/calls/wrapup — after a call: save notes on the call log and push the outcome
// (stage, next follow-up) onto the contact record, creating the contact if it's a new number.
import { z } from "zod";
import { apiMember, HttpError } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { findCallForMember } from "@/lib/calls";
import { db } from "@/lib/db";
import { countryOf } from "@/lib/phone";

const Body = z.object({
  logId: z.string().optional(),
  callSid: z.string().optional(),
  number: z.string().optional(),
  notes: z.string().max(10_000).optional(),
  stage: z.enum(["new", "researched", "contacted", "follow_up", "won", "lost"]).optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).nullable().optional(),
  newContact: z.object({ businessName: z.string().min(1).max(200) }).optional(),
  /** Outbound call "answered" by voicemail / an answering machine, not a person. */
  reachedVoicemail: z.boolean().optional(),
});

export const POST = jsonRoute(async (req: Request) => {
  const member = await apiMember();
  const body = Body.parse(await req.json());

  const call = await findCallForMember(member.id, body);
  if (!call) throw new HttpError(404, "Call not found yet — it may still be finishing. Try again in a moment.");

  let contactId = call.contactId;
  if (!contactId && body.newContact) {
    const external = call.direction === "outbound" ? call.toNumber : call.fromNumber;
    const c = await db.contact.create({
      data: {
        businessName: body.newContact.businessName,
        phoneNumber: external,
        country: countryOf(external),
        stage: call.status === "completed" ? "contacted" : "new",
        lastContactedAt: call.status === "completed" ? call.startedAt : null,
        createdById: member.id,
        assignedToId: member.id,
      },
    });
    contactId = c.id;
  }

  const markVoicemail = Boolean(body.reachedVoicemail) && call.direction === "outbound" && call.status === "completed";
  await db.callLog.update({
    where: { id: call.id },
    data: {
      notes: body.notes?.trim() || call.notes,
      contactId,
      // An inbound call handled from the missed list gets attributed to whoever wrote it up.
      teamMemberId: call.teamMemberId ?? member.id,
      // Twilio can't tell a person from an answering machine (without paid AMD); the caller can.
      ...(markVoicemail ? { status: "voicemail" as const } : {}),
    },
  });

  if (contactId) {
    const contact = await db.contact.findUnique({ where: { id: contactId }, select: { stage: true } });
    // Only move forward automatically: New/Researched → Contacted after a real conversation.
    const autoStage =
      !body.stage && call.status === "completed" && !markVoicemail && contact && ["new", "researched"].includes(contact.stage)
        ? ("contacted" as const)
        : undefined;
    const stage = body.stage ?? autoStage;
    await db.contact.update({
      where: { id: contactId },
      data: {
        ...(stage ? { stage } : {}),
        ...(body.nextFollowUpAt !== undefined
          ? { nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null }
          : {}),
      },
    });
  }
  return { ok: true, contactId };
});
