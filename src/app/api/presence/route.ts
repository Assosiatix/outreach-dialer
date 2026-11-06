// POST /api/presence — heartbeat from the open dialer tab (every ~20s) and status changes.
// GET  /api/presence — team presence + counters used by the app shell.
import { z } from "zod";
import { apiMember } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { db } from "@/lib/db";
import { setPresence, teamPresence } from "@/lib/presence";

const Body = z.object({ status: z.enum(["online", "away", "on_call", "offline"]) });

export const POST = jsonRoute(async (req: Request) => {
  const member = await apiMember();
  const { status } = Body.parse(await req.json());
  await setPresence(member.id, status);
  return { ok: true };
});

export const GET = jsonRoute(async () => {
  const member = await apiMember();
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const [team, dueFollowUps, unhandled] = await Promise.all([
    teamPresence(),
    db.contact.count({
      where: {
        nextFollowUpAt: { lte: endOfDay },
        stage: { notIn: ["won", "lost"] },
        OR: [{ assignedToId: member.id }, { assignedToId: null }],
      },
    }),
    // Missed/voicemail calls in the last 7 days nobody has written notes on yet.
    db.callLog.count({
      where: {
        direction: "inbound",
        status: { in: ["missed", "voicemail"] },
        notes: null,
        startedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      },
    }),
  ]);
  return { team, dueFollowUps, unhandled };
});
