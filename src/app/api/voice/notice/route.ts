// POST /api/voice/notice — <Number url>: played to the called party right after they answer,
// before the call is bridged. Used for the recording notice (two-party-consent US states such as
// CA, FL, IL, PA, WA require telling the other side a call is recorded).
import { env } from "@/lib/env";
import { forbidden, readTwilioRequest, twiml, VoiceResponse } from "@/lib/twilio";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const r = new VoiceResponse();
  if (env.recordingNotice) r.say(env.recordingNotice);
  return twiml(r.toString());
}
