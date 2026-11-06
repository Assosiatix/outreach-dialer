// GET /api/cron — every 10 minutes (VPS crontab, see docs/deploy.md):
//  1. reconcile stale call logs against Twilio
//  2. once a day per member (from DIGEST_HOUR_UTC, default 04:00 UTC = 09:00 PKT), email the
//     follow-ups due today.
// Auth: `Authorization: Bearer $CRON_SECRET`.
import { sendFollowUpDigest } from "@/lib/alerts";
import { estimateUnpriced, syncPendingCosts } from "@/lib/costs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { reconcileStaleCalls } from "@/lib/reconcile";

export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  await reconcileStaleCalls(true).catch((err) => log.error("cron reconcile failed", err));
  // Replace cost estimates with Twilio's actual prices + budget alerts.
  await estimateUnpriced().catch((err) => log.error("cron estimate failed", err));
  await syncPendingCosts({ force: true, limit: 100 }).catch((err) => log.error("cron cost sync failed", err));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const digestHour = Number(process.env.DIGEST_HOUR_UTC ?? "4"); // 04:00 UTC = 09:00 PKT
  let digests = 0;
  if (now.getUTCHours() >= digestHour) {
    const endOfDay = new Date(`${today}T23:59:59.999Z`);
    const members = await db.teamMember.findMany({
      where: { active: true, OR: [{ lastDigestDate: null }, { lastDigestDate: { not: today } }] },
    });
    for (const m of members) {
      const due = await db.contact.findMany({
        where: {
          nextFollowUpAt: { lte: endOfDay },
          stage: { notIn: ["won", "lost"] },
          OR: [{ assignedToId: m.id }, { assignedToId: null }],
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 50,
        select: { id: true, businessName: true, phoneNumber: true, nextFollowUpAt: true },
      });
      await sendFollowUpDigest(m, due);
      await db.teamMember.update({ where: { id: m.id }, data: { lastDigestDate: today } });
      if (due.length) digests++;
    }
  }
  return Response.json({ ok: true, digests });
}
