// GET /api/pricing/rate?number=+1… — live per-minute rate before dialing.
// Admins get the rate; callers only get the "expensive destination" flag (costs are admin-only).
import { apiMember, HttpError } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { EXPENSIVE_RATE_MICROS } from "@/lib/cost-math";
import { getRate } from "@/lib/costs";
import { parsePhone } from "@/lib/phone";

export const GET = jsonRoute(async (req: Request) => {
  const me = await apiMember();
  const parsed = parsePhone(new URL(req.url).searchParams.get("number") ?? "");
  if (!parsed) throw new HttpError(400, "Invalid number");
  const rate = await getRate(parsed.e164, "outbound");
  return {
    expensive: rate !== null && rate > EXPENSIVE_RATE_MICROS,
    ...(me.role === "admin" ? { rateMicros: rate } : {}),
  };
});
