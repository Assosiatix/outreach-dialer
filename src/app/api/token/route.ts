// POST /api/token — short-lived Twilio Voice access token for the logged-in team member.
import { apiMember, HttpError } from "@/lib/auth";
import { jsonRoute } from "@/lib/api";
import { cleanEnv } from "@/lib/env";
import { createVoiceToken, twilioConfigured } from "@/lib/twilio";

export const POST = jsonRoute(async () => {
  const member = await apiMember();
  if (!twilioConfigured()) {
    throw new HttpError(503, "Twilio is not configured yet. Fill the TWILIO_* values in .env and restart.");
  }
  // TWILIO_EDGE: nearest Twilio edge for media, e.g. "singapore" for callers in Pakistan.
  return { ...createVoiceToken(member.id), edge: cleanEnv(process.env.TWILIO_EDGE) || "roaming" };
});
