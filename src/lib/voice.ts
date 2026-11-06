import "server-only";
import { env } from "./env";
import { VoiceResponse, webhookUrl } from "./twilio";

/** Voicemail: greeting + <Record>. Recording lands via recordingStatusCallback. */
export function voicemailTwiml(logId: string, intro?: string) {
  const r = new VoiceResponse();
  if (intro) r.say(intro);
  r.say(env.voicemailGreeting);
  r.record({
    maxLength: 180,
    playBeep: true,
    timeout: 6,
    trim: "trim-silence",
    action: webhookUrl("/api/voice/voicemail/done", { logId }),
    method: "POST",
    recordingStatusCallback: webhookUrl("/api/voice/voicemail/recording", { logId }),
    recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["completed"],
  });
  // If the caller says nothing, <Record> times out and continues here.
  r.say("We didn't get a message. Goodbye.");
  r.hangup();
  return r.toString();
}

export function sayAndHangup(message: string) {
  const r = new VoiceResponse();
  r.say(message);
  r.hangup();
  return r.toString();
}

export function emptyTwiml() {
  return new VoiceResponse().toString();
}
