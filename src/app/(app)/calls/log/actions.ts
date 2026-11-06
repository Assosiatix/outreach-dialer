"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/format";
import { inboundMode } from "@/lib/numbers";
import { countryOf, parsePhone } from "@/lib/phone";

export type LogState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const Schema = z.object({
  contactId: z.string().optional(),
  phoneNumber: z.string().optional(),
  businessName: z.string().trim().max(200).optional(),
  direction: z.enum(["inbound", "outbound"]),
  outcome: z.enum(["completed", "no_answer", "busy", "voicemail", "missed"]),
  when: z.string().min(1, "When did the call happen?"),
  minutes: z.string().optional(),
  notes: z.string().trim().max(10_000).optional(),
  stage: z.enum(["", "new", "researched", "contacted", "follow_up", "won", "lost"]).optional(),
  nextFollowUpAt: z.string().optional(),
});

/**
 * A call that happened outside Twilio (e.g. a prospect called the Numero number back).
 * Stored in call_logs with no CallSid — that's what marks it as manual — and a final cost of
 * nothing, so Spend never estimates or counts it.
 */
export async function logManualCall(_prev: LogState, form: FormData): Promise<LogState> {
  const me = await requireMember();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;
  const p = Schema.safeParse(raw);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { fieldErrors };
  }
  const d = p.data;

  // Who was it with?
  let contact = d.contactId ? await db.contact.findUnique({ where: { id: d.contactId } }) : null;
  let external: string;
  if (contact) {
    external = contact.phoneNumber;
  } else {
    const phone = parsePhone(d.phoneNumber ?? "");
    if (!phone) return { fieldErrors: { phoneNumber: "Pick a contact, or enter the number with country code (+1…)." } };
    external = phone.e164;
    contact = await db.contact.findFirst({ where: { phoneNumber: external } });
    if (!contact && d.businessName) {
      contact = await db.contact.create({
        data: { businessName: d.businessName, phoneNumber: external, country: countryOf(external), createdById: me.id, assignedToId: me.id },
      });
    }
  }

  const startedAt = fromLocalInput(d.when);
  if (!startedAt) return { fieldErrors: { when: "Pick a valid date and time." } };
  if (startedAt.getTime() > Date.now() + 5 * 60_000) return { fieldErrors: { when: "That's in the future." } };
  const minutes = Math.max(0, Math.min(600, Number(d.minutes || 0) || 0));
  const duration = d.outcome === "completed" ? Math.round(minutes * 60) : 0;
  const ourNumber = (await inboundMode()).callerId ?? "";

  const call = await db.callLog.create({
    data: {
      callSid: null,
      direction: d.direction,
      fromNumber: d.direction === "inbound" ? external : ourNumber,
      toNumber: d.direction === "inbound" ? ourNumber : external,
      status: d.outcome,
      duration,
      notes: d.notes || null,
      contactId: contact?.id,
      teamMemberId: me.id,
      startedAt,
      answeredAt: d.outcome === "completed" ? startedAt : null,
      endedAt: new Date(startedAt.getTime() + duration * 1000),
      costStatus: "final", // not a Twilio call: nothing to price
      errorMessage: null,
    },
  });

  if (contact) {
    const contacted = ["completed", "voicemail"].includes(d.outcome);
    await db.contact.update({
      where: { id: contact.id },
      data: {
        ...(contacted && (!contact.lastContactedAt || contact.lastContactedAt < startedAt) ? { lastContactedAt: startedAt } : {}),
        ...(d.stage ? { stage: d.stage } : {}),
        ...(d.nextFollowUpAt === "clear"
          ? { nextFollowUpAt: null }
          : d.nextFollowUpAt
            ? { nextFollowUpAt: fromLocalInput(d.nextFollowUpAt) }
            : {}),
      },
    });
  }

  revalidatePath("/calls");
  revalidatePath("/");
  if (contact) {
    revalidatePath(`/contacts/${contact.id}`);
    redirect(`/contacts/${contact.id}?logged=${call.id}`);
  }
  redirect(`/calls/${call.id}`);
}
