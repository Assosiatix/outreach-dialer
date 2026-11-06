// POST /api/voice/voicemail/done — <Record action>: caller finished the message.
import { forbidden, readTwilioRequest, twiml } from "@/lib/twilio";
import { sayAndHangup } from "@/lib/voice";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  return twiml(sayAndHangup("Thank you. We'll get back to you soon. Goodbye."));
}
