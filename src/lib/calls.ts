import "server-only";
import type { CallLog, CallStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { canTransition, isFinal } from "./call-status";
import { background, estimateAndStore } from "./costs";
import { log } from "./log";

/** Find the contact for a phone number (E.164 exact match). */
export async function contactForNumber(e164: string | null | undefined) {
  if (!e164 || !e164.startsWith("+")) return null;
  return db.contact.findFirst({ where: { phoneNumber: e164 }, orderBy: { updatedAt: "desc" } });
}

/**
 * Apply a status update from any Twilio callback, respecting ordering rules (canTransition).
 * Extra fields (duration, sids, error) are always merged. Returns the updated row, or null if the
 * log doesn't exist.
 */
export async function applyCallUpdate(
  logId: string,
  status: CallStatus | null,
  extra: Prisma.CallLogUpdateInput = {},
): Promise<CallLog | null> {
  const current = await db.callLog.findUnique({ where: { id: logId } });
  if (!current) {
    log.warn("call log not found for update", { logId, status });
    return null;
  }
  const data: Prisma.CallLogUpdateInput = { ...extra };
  if (status && canTransition(current.status, status)) {
    data.status = status;
    if (status === "in_progress" && !current.answeredAt) data.answeredAt = new Date();
    if (isFinal(status) && !current.endedAt) data.endedAt = new Date();
  }
  if (Object.keys(data).length === 0) return current;
  const updated = await db.callLog.update({ where: { id: logId }, data });

  // Cost: estimate as soon as the call has an outcome, and refresh it when talk time / a
  // recording arrives later. The actual Twilio price replaces it via syncPendingCosts.
  if (isFinal(updated.status) && updated.costStatus !== "final" && (data.status || "duration" in extra || "recordingDuration" in extra)) {
    background(() => estimateAndStore(updated.id));
  }

  // A connected call counts as contact for the CRM record.
  if (updated.contactId && data.status && ["in_progress", "completed", "voicemail"].includes(String(data.status))) {
    await db.contact
      .update({
        where: { id: updated.contactId },
        data: { lastContactedAt: new Date() },
      })
      .catch(() => {});
    // A conversation happened: move New/Researched forward (never touch later stages).
    if (String(data.status) === "in_progress" || String(data.status) === "completed") {
      await db.contact
        .updateMany({ where: { id: updated.contactId, stage: { in: ["new", "researched"] } }, data: { stage: "contacted" } })
        .catch(() => {});
    }
  }
  return updated;
}

export async function findLogByCallSid(callSid: string | null | undefined) {
  if (!callSid) return null;
  return db.callLog.findUnique({ where: { callSid } });
}

/**
 * Find the call a browser is asking about after hang-up: by log id (inbound), CallSid, or — for an
 * outbound call that ended before Twilio reported a CallSid — this member's latest call to that number.
 */
export async function findCallForMember(memberId: string, q: { logId?: string | null; callSid?: string | null; number?: string | null }) {
  if (q.logId) return db.callLog.findUnique({ where: { id: q.logId } });
  if (q.callSid) return db.callLog.findFirst({ where: { OR: [{ callSid: q.callSid }, { childCallSid: q.callSid }] } });
  if (q.number) {
    return db.callLog.findFirst({
      where: { teamMemberId: memberId, direction: "outbound", toNumber: q.number, startedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
      orderBy: { startedAt: "desc" },
    });
  }
  return null;
}

export function intParam(v: string | null | undefined): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
