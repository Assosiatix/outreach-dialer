import "server-only";
import { db } from "./db";
import { applyCallUpdate, intParam } from "./calls";
import { fromTwilioStatus, isFinal } from "./call-status";
import { log } from "./log";
import { twilioClient, twilioConfigured } from "./twilio";

let lastRun = 0;

/**
 * Last line of defence against lost webhooks (VPS restart mid-call, network blip): any call log
 * stuck in a transient state for > 15 minutes is checked against Twilio's REST API and finalized.
 * Throttled to once per 5 minutes; safe to call from page loads and the cron endpoint.
 */
export async function reconcileStaleCalls(force = false) {
  if (!force && Date.now() - lastRun < 5 * 60_000) return;
  lastRun = Date.now();

  const stale = await db.callLog.findMany({
    where: {
      status: { in: ["initiated", "ringing", "in_progress"] },
      startedAt: { lt: new Date(Date.now() - 15 * 60_000) },
    },
    take: 50,
  });
  for (const call of stale) {
    try {
      let final: ReturnType<typeof fromTwilioStatus> = null;
      let duration = call.duration;
      if (twilioConfigured() && call.callSid) {
        const remote = await twilioClient().calls(call.childCallSid ?? call.callSid).fetch();
        final = fromTwilioStatus(remote.status);
        duration = Math.max(duration, call.childCallSid ? intParam(remote.duration) : 0);
        if (final && !isFinal(final)) continue; // genuinely still live
      }
      if (!final || final === "completed") {
        final = call.answeredAt ? "completed" : call.direction === "inbound" ? "missed" : "no_answer";
      }
      await applyCallUpdate(call.id, final, { duration, errorMessage: call.errorMessage ?? "Finalized by reconciliation" });
      log.info("reconciled stale call", { logId: call.id, final });
    } catch (err) {
      log.error("reconcile failed", err, { logId: call.id });
      // A call Twilio has no record of, hours later, will never get a callback.
      if (Date.now() - call.startedAt.getTime() > 6 * 3600_000) {
        await applyCallUpdate(call.id, call.direction === "inbound" ? "missed" : "failed", {
          errorMessage: "Finalized by reconciliation (no Twilio record)",
        }).catch(() => {});
      }
    }
  }
}
