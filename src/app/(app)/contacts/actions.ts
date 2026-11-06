"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/format";
import { parsePhone } from "@/lib/phone";

export type ContactFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const Schema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(200),
  contactPerson: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  country: z.string().trim().length(2).optional().or(z.literal("")),
  phoneNumber: z.string().trim().min(4, "Phone number is required"),
  email: z.string().trim().email("Not a valid email").optional().or(z.literal("")),
  issueIdentified: z.string().trim().max(5000).optional(),
  researchNotes: z.string().trim().max(50000).optional(),
  stage: z.enum(["new", "researched", "contacted", "follow_up", "won", "lost"]),
  nextFollowUpAt: z.string().optional(),
  assignedToId: z.string().optional(),
});

function read(form: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

function normalizeWebsite(w?: string) {
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

async function toData(form: FormData) {
  const parsed = Schema.safeParse(read(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { fieldErrors } as const;
  }
  const d = parsed.data;
  const phone = parsePhone(d.phoneNumber, d.country || null);
  if (!phone) {
    return { fieldErrors: { phoneNumber: "Can't read this number. Include the country code, e.g. +44 20 7123 4567." } } as const;
  }
  return {
    data: {
      businessName: d.businessName,
      contactPerson: d.contactPerson || null,
      website: normalizeWebsite(d.website),
      country: (d.country || phone.country || null)?.toUpperCase() ?? null,
      phoneNumber: phone.e164,
      email: d.email || null,
      issueIdentified: d.issueIdentified || null,
      researchNotes: d.researchNotes || null,
      stage: d.stage,
      nextFollowUpAt: fromLocalInput(d.nextFollowUpAt),
      assignedToId: d.assignedToId || null,
    },
  } as const;
}

export async function createContact(_prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  const me = await requireMember();
  const r = await toData(form);
  if ("fieldErrors" in r) return { fieldErrors: r.fieldErrors };
  const dupe = await db.contact.findFirst({ where: { phoneNumber: r.data.phoneNumber }, select: { id: true, businessName: true } });
  if (dupe && form.get("allowDuplicate") !== "1") {
    return { fieldErrors: { phoneNumber: `Already saved as “${dupe.businessName}”.` } };
  }
  const c = await db.contact.create({ data: { ...r.data, createdById: me.id } });
  revalidatePath("/contacts");
  redirect(`/contacts/${c.id}`);
}

export async function updateContact(id: string, _prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  await requireMember();
  const r = await toData(form);
  if ("fieldErrors" in r) return { fieldErrors: r.fieldErrors };
  await db.contact.update({ where: { id }, data: r.data });
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const me = await requireMember();
  if (me.role !== "admin") throw new Error("Only admins can delete contacts");
  await db.contact.delete({ where: { id } });
  revalidatePath("/contacts");
  redirect("/contacts");
}

/** Inline research-notes save from the contact page. */
export async function saveResearch(id: string, form: FormData) {
  await requireMember();
  await db.contact.update({
    where: { id },
    data: {
      issueIdentified: String(form.get("issueIdentified") ?? "").trim() || null,
      researchNotes: String(form.get("researchNotes") ?? "").trim() || null,
    },
  });
  revalidatePath(`/contacts/${id}`);
}

export async function setStage(id: string, stage: string) {
  await requireMember();
  const s = z.enum(["new", "researched", "contacted", "follow_up", "won", "lost"]).parse(stage);
  await db.contact.update({ where: { id }, data: { stage: s } });
  revalidatePath(`/contacts/${id}`);
}

export async function setFollowUp(id: string, form: FormData) {
  await requireMember();
  const v = String(form.get("nextFollowUpAt") ?? "");
  await db.contact.update({ where: { id }, data: { nextFollowUpAt: v === "clear" ? null : fromLocalInput(v) } });
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/");
}

/** CSV import: business_name, phone_number, country, website, issue_identified, research_notes */
export async function importContacts(_prev: { error?: string; done?: string } | undefined, form: FormData) {
  const me = await requireMember();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { error: "File too large (max 2 MB)." };
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { error: "The CSV has no data rows." };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);
  if (col("business_name") < 0 || col("phone_number") < 0) {
    return { error: "CSV needs at least business_name and phone_number columns." };
  }
  let created = 0;
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? "").trim() : "");
    const phone = parsePhone(get("phone_number"), get("country") || null);
    if (!get("business_name") || !phone) {
      skipped++;
      continue;
    }
    const exists = await db.contact.findFirst({ where: { phoneNumber: phone.e164 }, select: { id: true } });
    if (exists) {
      skipped++;
      continue;
    }
    await db.contact.create({
      data: {
        businessName: get("business_name"),
        phoneNumber: phone.e164,
        country: (get("country") || phone.country || "").toUpperCase() || null,
        website: normalizeWebsite(get("website") || undefined),
        contactPerson: get("contact_person") || null,
        email: get("email") || null,
        issueIdentified: get("issue_identified") || null,
        researchNotes: get("research_notes") || null,
        stage: get("research_notes") || get("issue_identified") ? "researched" : "new",
        createdById: me.id,
      },
    });
    created++;
  }
  revalidatePath("/contacts");
  return { done: `Imported ${created} contact${created === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} (invalid or duplicate)` : ""}.` };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
