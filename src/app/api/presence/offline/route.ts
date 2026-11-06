// POST /api/presence/offline — sent with navigator.sendBeacon when the tab closes.
import { getCurrentMember } from "@/lib/auth";
import { setPresence } from "@/lib/presence";

export async function POST() {
  const member = await getCurrentMember();
  if (member) await setPresence(member.id, "offline");
  return new Response(null, { status: 204 });
}
