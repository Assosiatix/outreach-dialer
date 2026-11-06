"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { parsePhone } from "@/lib/phone";
import { twilioConfigured } from "@/lib/twilio";
import { clearWebhookHealthCache, configureWebhooks, syncNumbersFromTwilio } from "@/lib/twilio-setup";

export type Msg = { ok?: string; error?: string } | undefined;

// ── numbers ──────────────────────────────────────────────────────────────
export async function addNumber(_p: Msg, form: FormData): Promise<Msg> {
  await requireAdmin();
  const phone = parsePhone(String(form.get("phoneNumber") ?? ""));
  if (!phone) return { error: "Enter the number in international format, e.g. +1 415 555 0100." };
  if (await db.twilioNumber.findUnique({ where: { phoneNumber: phone.e164 } })) return { error: "That number is already added." };
  const isFirst = (await db.twilioNumber.count()) === 0;
  await db.twilioNumber.create({
    data: {
      phoneNumber: phone.e164,
      country: (String(form.get("country") ?? "") || phone.country || "US").toUpperCase(),
      label: String(form.get("label") ?? "").trim() || null,
      smsEnabled: form.get("smsEnabled") === "on",
      isDefault: isFirst,
    },
  });
  revalidatePath("/settings/numbers");
  return { ok: "Number added." };
}

export async function setDefaultNumber(id: string) {
  await requireAdmin();
  await db.$transaction([db.twilioNumber.updateMany({ data: { isDefault: false } }), db.twilioNumber.update({ where: { id }, data: { isDefault: true } })]);
  revalidatePath("/settings/numbers");
}

export async function toggleNumberSms(id: string) {
  await requireAdmin();
  const n = await db.twilioNumber.findUnique({ where: { id } });
  if (n && !n.verifiedOnly) await db.twilioNumber.update({ where: { id }, data: { smsEnabled: !n.smsEnabled } });
  revalidatePath("/settings/numbers");
}

export async function updateNumberLabel(id: string, form: FormData) {
  await requireAdmin();
  await db.twilioNumber.update({ where: { id }, data: { label: String(form.get("label") ?? "").trim() || null } });
  revalidatePath("/settings/numbers");
}

export async function removeNumber(id: string) {
  await requireAdmin();
  await db.twilioNumber.delete({ where: { id } });
  revalidatePath("/settings/numbers");
}

export async function syncNumbers(): Promise<Msg> {
  await requireAdmin();
  if (!twilioConfigured()) return { error: "Twilio keys are not set in .env yet." };
  try {
    const r = await syncNumbersFromTwilio();
    revalidatePath("/settings/numbers");
    const parts = [`${r.found} purchased number${r.found === 1 ? "" : "s"}`, `${r.verified} verified caller ID${r.verified === 1 ? "" : "s"}`];
    const warn =
      r.found === 0
        ? " No purchased number yet — outbound calls work with a verified caller ID, but inbound calls, voicemail and SMS need a number bought in Twilio (Phone Numbers → Buy a number)."
        : "";
    return { ok: `Found ${parts.join(" and ")}, added ${r.added}.${warn}` };
  } catch (err) {
    log.error("sync numbers failed", err);
    return { error: `Twilio error: ${(err as Error).message}` };
  }
}

export async function applyWebhooks(): Promise<Msg> {
  await requireAdmin();
  if (!twilioConfigured()) return { error: "Twilio keys are not set in .env yet." };
  try {
    const r = await configureWebhooks();
    clearWebhookHealthCache();
    revalidatePath("/", "layout");
    return { ok: `TwiML App and ${r.numbers} number${r.numbers === 1 ? "" : "s"} now point at ${r.base}.` };
  } catch (err) {
    log.error("configure webhooks failed", err);
    return { error: (err as Error).message };
  }
}

// ── team ─────────────────────────────────────────────────────────────────
const Member = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  role: z.enum(["admin", "caller"]),
  alertPhone: z.string().optional(),
});

export async function addMember(_p: Msg, form: FormData): Promise<Msg> {
  await requireAdmin();
  const r = Member.safeParse(Object.fromEntries(form));
  if (!r.success) return { error: r.error.issues[0].message };
  if (await db.teamMember.findUnique({ where: { email: r.data.email } })) return { error: "Someone with that email already exists." };
  let alertPhone: string | null = null;
  if (r.data.alertPhone?.trim()) {
    alertPhone = parsePhone(r.data.alertPhone)?.e164 ?? null;
    if (!alertPhone) return { error: "Alert phone must be in international format (+92…)." };
  }
  await db.teamMember.create({
    data: { name: r.data.name, email: r.data.email, role: r.data.role, passwordHash: await hashPassword(r.data.password), alertPhone },
  });
  revalidatePath("/settings/team");
  return { ok: `${r.data.name} can now sign in.` };
}

export async function updateMember(id: string, _p: Msg, form: FormData): Promise<Msg> {
  const me = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const role = form.get("role") === "admin" ? "admin" : "caller";
  const rawPhone = String(form.get("alertPhone") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const alertPhone = rawPhone ? parsePhone(rawPhone)?.e164 : null;
  if (rawPhone && !alertPhone) return { error: "Alert phone must be in international format (+92…)." };
  if (password && password.length < 10) return { error: "New password must be at least 10 characters." };
  if (id === me.id && role !== "admin") return { error: "You can't remove your own admin role." };
  await db.teamMember.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      role,
      alertPhone: alertPhone ?? null,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  revalidatePath("/settings/team");
  return { ok: password ? "Saved. Password changed." : "Saved." };
}

export async function setMemberActive(id: string, active: boolean) {
  const me = await requireAdmin();
  if (id === me.id) return;
  await db.teamMember.update({ where: { id }, data: { active, ...(active ? {} : { status: "offline" }) } });
  revalidatePath("/settings/team");
}
