"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPassword, createSession, destroySession, getCurrentMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { setPresence } from "@/lib/presence";

const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

// Tiny in-memory brute-force guard (single VPS instance).
const attempts = new Map<string, { n: number; until: number }>();

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = Login.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password } = parsed.data;

  const a = attempts.get(email);
  if (a && a.until > Date.now()) return { error: "Too many attempts. Try again in a few minutes." };

  const member = await db.teamMember.findUnique({ where: { email } });
  const ok = member && member.active && (await checkPassword(password, member.passwordHash));
  if (!ok) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(email, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: "Wrong email or password." };
  }
  attempts.delete(email);
  await createSession(member);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const m = await getCurrentMember();
  if (m) await setPresence(m.id, "offline");
  await destroySession();
  redirect("/login");
}
