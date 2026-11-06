"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { countryOf } from "@/lib/phone";

export async function saveCallNotes(id: string, form: FormData) {
  const me = await requireMember();
  const call = await db.callLog.findUnique({ where: { id } });
  if (!call) return;
  await db.callLog.update({
    where: { id },
    data: { notes: String(form.get("notes") ?? "").trim() || null, teamMemberId: call.teamMemberId ?? me.id },
  });
  revalidatePath(`/calls/${id}`);
  revalidatePath("/calls");
}

/** Turn an unknown caller into a contact and link this call (and other calls from that number). */
export async function createContactFromCall(id: string, form: FormData) {
  const me = await requireMember();
  const call = await db.callLog.findUnique({ where: { id } });
  if (!call) return;
  const businessName = String(form.get("businessName") ?? "").trim();
  if (!businessName) return;
  const external = call.direction === "outbound" ? call.toNumber : call.fromNumber;
  const contact = await db.contact.create({
    data: {
      businessName,
      phoneNumber: external,
      country: countryOf(external),
      stage: call.status === "completed" ? "contacted" : "new",
      lastContactedAt: call.status === "completed" ? call.startedAt : null,
      createdById: me.id,
    },
  });
  await db.callLog.updateMany({
    where: { contactId: null, OR: [{ fromNumber: external }, { toNumber: external }] },
    data: { contactId: contact.id },
  });
  redirect(`/contacts/${contact.id}`);
}
