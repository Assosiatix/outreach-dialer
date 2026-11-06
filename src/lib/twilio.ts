import "server-only";
import twilio from "twilio";
import { cleanEnv, env } from "./env";
import { log } from "./log";

let _client: ReturnType<typeof twilio> | null = null;

/** REST client authenticated with the API key (Auth Token stays for signature checks). */
export function twilioClient() {
  if (!_client) {
    _client = twilio(env.twilio.apiKeySid, env.twilio.apiKeySecret, { accountSid: env.twilio.accountSid });
  }
  return _client;
}

export const VoiceResponse = twilio.twiml.VoiceResponse;
export const MessagingResponse = twilio.twiml.MessagingResponse;

/** Browser client identity for a team member. */
export function identityFor(memberId: string) {
  return `member_${memberId}`;
}
export function memberIdFromIdentity(identity: string | null | undefined): string | null {
  const id = (identity ?? "").replace(/^client:/, "");
  return id.startsWith("member_") ? id.slice("member_".length) : null;
}

/** Short-lived Voice access token for the browser SDK (1 hour, refreshed by the client). */
export function createVoiceToken(memberId: string): { token: string; identity: string; ttl: number } {
  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;
  const identity = identityFor(memberId);
  const ttl = 3600;
  const token = new AccessToken(env.twilio.accountSid, env.twilio.apiKeySid, env.twilio.apiKeySecret, {
    identity,
    ttl,
  });
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: env.twilio.twimlAppSid, incomingAllow: true }));
  return { token: token.toJwt(), identity, ttl };
}

/** Absolute webhook URL on our public origin. */
export function webhookUrl(path: string, query?: Record<string, string | undefined>) {
  const u = new URL(path, env.publicBaseUrl + "/");
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Read and verify a Twilio webhook. Twilio signs the exact public URL it called, so we rebuild it
 * from PUBLIC_BASE_URL (the app sits behind a reverse proxy on the VPS). Returns null if the
 * signature is invalid — callers must reject the request.
 */
export async function readTwilioRequest(req: Request): Promise<Record<string, string> | null> {
  try {
    return await readTwilioRequestUnsafe(req);
  } catch (err) {
    log.error("twilio request validation failed", err);
    return null; // treated as invalid signature → 403
  }
}

async function readTwilioRequestUnsafe(req: Request): Promise<Record<string, string> | null> {
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text)) params[k] = v;

  if (env.twilio.skipSignature) return params;

  const incoming = new URL(req.url);
  const publicUrl = env.publicBaseUrl + incoming.pathname + incoming.search;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const ok = twilio.validateRequest(env.twilio.authToken, signature, publicUrl, params);
  if (!ok) {
    log.warn("twilio signature rejected", { url: publicUrl });
    return null;
  }
  return params;
}

export function twiml(xml: string, status = 200) {
  return new Response(xml, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

export function forbidden() {
  return new Response("Invalid Twilio signature", { status: 403 });
}

export function twilioConfigured(): boolean {
  return Boolean(
    cleanEnv(process.env.TWILIO_ACCOUNT_SID)?.startsWith("AC") &&
      cleanEnv(process.env.TWILIO_AUTH_TOKEN) &&
      cleanEnv(process.env.TWILIO_API_KEY_SID)?.startsWith("SK") &&
      cleanEnv(process.env.TWILIO_API_KEY_SECRET) &&
      cleanEnv(process.env.TWILIO_TWIML_APP_SID)?.startsWith("AP"),
  );
}
