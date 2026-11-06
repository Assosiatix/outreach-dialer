import "server-only";
import type { MemberStatus } from "@prisma/client";
import { db } from "./db";

/** The dialer tab heartbeats every 20s; after this long without one we treat the member as offline. */
export const PRESENCE_STALE_MS = 60_000;

export function effectiveStatus(status: MemberStatus, lastSeenAt: Date | null, now = Date.now()): MemberStatus {
  if (status === "offline") return "offline";
  if (!lastSeenAt || now - lastSeenAt.getTime() > PRESENCE_STALE_MS) return "offline";
  return status;
}

export async function setPresence(memberId: string, status: MemberStatus) {
  await db.teamMember.update({
    where: { id: memberId },
    data: { status, lastSeenAt: status === "offline" ? null : new Date() },
  });
}

/** Members whose browser should ring for an inbound call: online (not away/on a call), fresh heartbeat. */
export async function ringableMembers() {
  return db.teamMember.findMany({
    where: {
      active: true,
      status: "online",
      lastSeenAt: { gt: new Date(Date.now() - PRESENCE_STALE_MS) },
    },
    select: { id: true, name: true },
  });
}

export async function teamPresence() {
  const members = await db.teamMember.findMany({
    where: { active: true },
    select: { id: true, name: true, status: true, lastSeenAt: true },
    orderBy: { name: "asc" },
  });
  return members.map((m) => ({ id: m.id, name: m.name, status: effectiveStatus(m.status, m.lastSeenAt) }));
}
