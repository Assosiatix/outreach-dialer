// GET /api/recordings/:callLogId — serves the Twilio recording to a logged-in team member.
// Recordings stay private on Twilio; the browser never sees Twilio credentials.
//
// Why it buffers instead of streaming: Twilio's .mp3 endpoint ignores Range requests and sends no
// Content-Length. Browsers then can't show the duration or seek, and playback stalls. So the file
// is downloaded once (a few hundred KB per call), cached briefly, and Range requests are answered
// here. `RequestedChannels=1` mixes the dual-channel recording (caller left, prospect right) into
// mono so both voices play in both ears.
import { getCurrentMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

const CACHE_MAX = 20;
const cache = new Map<string, Buffer>(); // recordingSid → mp3 bytes (insertion order = LRU)

async function loadRecording(recordingSid: string): Promise<Buffer | null> {
  const hit = cache.get(recordingSid);
  if (hit) {
    cache.delete(recordingSid);
    cache.set(recordingSid, hit);
    return hit;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilio.accountSid}/Recordings/${recordingSid}.mp3?RequestedChannels=1`;
  const auth = Buffer.from(`${env.twilio.apiKeySid}:${env.twilio.apiKeySecret}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    log.warn("recording fetch failed", { recordingSid, status: res.status });
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  cache.set(recordingSid, buf);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return buf;
}

/** Parse a single "bytes=start-end" range. Returns null for absent/unsupported ranges. */
function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    if (m[2] === "") return "invalid";
    start = Math.max(0, size - Number(m[2])); // suffix: last N bytes
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

export async function GET(req: Request, ctx: RouteContext<"/api/recordings/[id]">) {
  const member = await getCurrentMember();
  if (!member) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;

  const call = await db.callLog.findUnique({ where: { id }, select: { recordingSid: true } });
  if (!call?.recordingSid) return new Response("No recording", { status: 404 });

  const buf = await loadRecording(call.recordingSid);
  if (!buf) return new Response("Recording unavailable", { status: 502 });

  const size = buf.length;
  const base = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const range = parseRange(req.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    const body = new Uint8Array(buf.subarray(range.start, range.end + 1));
    return new Response(body, {
      status: 206,
      headers: {
        ...base,
        "Content-Length": String(body.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }
  return new Response(new Uint8Array(buf), { status: 200, headers: { ...base, "Content-Length": String(size) } });
}
