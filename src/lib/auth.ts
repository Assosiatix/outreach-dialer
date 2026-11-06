import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { TeamMember } from "@prisma/client";
import { db } from "./db";
import { cleanEnv } from "./env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./session-token";

export type CurrentMember = Pick<TeamMember, "id" | "name" | "email" | "role" | "status" | "alertPhone">;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(member: Pick<TeamMember, "id" | "role" | "name">) {
  const token = await signSession({ sub: member.id, role: member.role, name: member.name });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // In dev you browse http://localhost while PUBLIC_BASE_URL is an https tunnel for Twilio.
    secure: process.env.NODE_ENV === "production" && (cleanEnv(process.env.PUBLIC_BASE_URL)?.startsWith("https://") ?? false),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The logged-in, still-active member, or null. Hits the DB so deactivation is immediate. */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const m = await db.teamMember.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true, status: true, alertPhone: true, active: true },
  });
  if (!m || !m.active) return null;
  return { id: m.id, name: m.name, email: m.email, role: m.role, status: m.status, alertPhone: m.alertPhone };
}

/** For pages: redirect to /login when signed out. */
export async function requireMember(): Promise<CurrentMember> {
  const m = await getCurrentMember();
  if (!m) redirect("/login");
  return m;
}

export async function requireAdmin(): Promise<CurrentMember> {
  const m = await requireMember();
  if (m.role !== "admin") redirect("/");
  return m;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For API route handlers: throws HttpError(401) when signed out. */
export async function apiMember(): Promise<CurrentMember> {
  const m = await getCurrentMember();
  if (!m) throw new HttpError(401, "Not signed in");
  return m;
}
