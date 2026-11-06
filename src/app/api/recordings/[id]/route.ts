// GET /api/recordings/:callLogId — streams the Twilio recording to a logged-in team member.
// Recordings stay private on Twilio; the browser never sees Twilio credentials.
import { getCurrentMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export async function GET(req: Request, ctx: RouteContext<"/api/recordings/[id]">) {
  const member = await getCurrentMember();
  if (!member) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;

  const call = await db.callLog.findUnique({ where: { id }, select: { recordingSid: true } });
  if (!call?.recordingSid) return new Response("No recording", { status: 404 });

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilio.accountSid}/Recordings/${call.recordingSid}.mp3`;
  const auth = Buffer.from(`${env.twilio.apiKeySid}:${env.twilio.apiKeySecret}`).toString("base64");
  const headers: Record<string, string> = { Authorization: `Basic ${auth}` };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(url, { headers });
  if (!upstream.ok && upstream.status !== 206) {
    log.warn("recording fetch failed", { id, status: upstream.status });
    return new Response("Recording unavailable", { status: 502 });
  }
  const out = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
