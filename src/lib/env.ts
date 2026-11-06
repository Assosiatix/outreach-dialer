import "server-only";

/** Server-side env access. Never import this from a client component. */
/** `docker run --env-file` keeps quotes literally; strip one pair of wrapping quotes. */
export function cleanEnv(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}
function req(name: string): string {
  const v = cleanEnv(process.env[name]);
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}
function opt(name: string, fallback = ""): string {
  return cleanEnv(process.env[name]) ?? fallback;
}

export const env = {
  get publicBaseUrl() {
    return req("PUBLIC_BASE_URL").replace(/\/+$/, "");
  },
  get sessionSecret() {
    const s = req("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  },
  twilio: {
    get accountSid() { return req("TWILIO_ACCOUNT_SID"); },
    get authToken() { return req("TWILIO_AUTH_TOKEN"); },
    get apiKeySid() { return req("TWILIO_API_KEY_SID"); },
    get apiKeySecret() { return req("TWILIO_API_KEY_SECRET"); },
    get twimlAppSid() { return req("TWILIO_TWIML_APP_SID"); },
    get defaultNumber() { return opt("TWILIO_DEFAULT_NUMBER"); },
    get skipSignature() {
      return opt("TWILIO_SKIP_SIGNATURE") === "true" && process.env.NODE_ENV !== "production";
    },
  },
  get callRecording() { return opt("CALL_RECORDING", "true") === "true"; },
  /** Played to the called party on answer when recording (two-party-consent US states). Empty = off. */
  get recordingNotice() {
    return opt("RECORDING_NOTICE", "This call may be recorded for quality purposes.");
  },
  /** Outbound calls to destinations above this USD/min rate are refused (cost / toll-fraud guard). */
  get maxCallRateMicros() {
    const n = Number(opt("MAX_CALL_RATE_USD", "0.50"));
    return Math.round((Number.isFinite(n) && n > 0 ? n : 0.5) * 1_000_000);
  },
  get inboundRingTimeout() {
    const n = Number(opt("INBOUND_RING_TIMEOUT", "22"));
    return Number.isFinite(n) ? Math.min(Math.max(n, 10), 60) : 22;
  },
  get voicemailGreeting() {
    return opt(
      "VOICEMAIL_GREETING",
      "We can't take your call right now. Please leave a message after the tone.",
    );
  },
  get alertSmsEnabled() { return opt("ALERT_SMS_ENABLED", "true") === "true"; },
  get resendApiKey() { return opt("RESEND_API_KEY"); },
  get alertEmailFrom() { return opt("ALERT_EMAIL_FROM", "Outreach Dialer <dialer@example.com>"); },
  get cronSecret() { return opt("CRON_SECRET"); },
};
