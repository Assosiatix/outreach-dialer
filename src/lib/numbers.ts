import "server-only";
import { db } from "./db";
import { env } from "./env";
import { selectCallerId } from "./caller-id";
import { countryOf } from "./phone";

export async function ownedNumbers() {
  return db.twilioNumber.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

export async function pickCallerId(destinationE164: string, requested?: string | null) {
  const owned = await ownedNumbers();
  return selectCallerId(destinationE164, owned, { requested, envDefault: env.twilio.defaultNumber || null });
}

/** Best SMS-capable sender for a destination (same-country first, then default). */
export async function pickSmsSender(destinationE164: string): Promise<string | null> {
  const all = await ownedNumbers();
  const owned = all.filter((n) => n.smsEnabled && !n.verifiedOnly);
  const country = countryOf(destinationE164);
  const envDefault = env.twilio.defaultNumber;
  // The env default is only a fallback if we don't know it to be a verified-only caller ID.
  const envOk = envDefault && !all.some((n) => n.phoneNumber === envDefault && n.verifiedOnly);
  return (
    owned.find((n) => n.country === country)?.phoneNumber ??
    owned.find((n) => n.isDefault)?.phoneNumber ??
    owned[0]?.phoneNumber ??
    (envOk ? envDefault : null)
  );
}

/** Sender for team alert SMS (needs a purchased, SMS-capable Twilio number). */
export async function alertSmsSender(): Promise<string | null> {
  const all = await ownedNumbers();
  const sms = all.filter((n) => n.smsEnabled && !n.verifiedOnly);
  const envDefault = env.twilio.defaultNumber;
  const envOk = envDefault && !all.some((n) => n.phoneNumber === envDefault && n.verifiedOnly);
  return sms.find((n) => n.isDefault)?.phoneNumber ?? sms[0]?.phoneNumber ?? (envOk ? envDefault : null);
}

/**
 * Outbound-only mode: no purchased Twilio number yet (only Verified Caller IDs). Inbound calls,
 * voicemail and SMS need a purchased number, so those features are hidden until one exists.
 */
export async function inboundMode(): Promise<{ outboundOnly: boolean; callerId: string | null }> {
  const all = await ownedNumbers();
  const purchased = all.some((n) => !n.verifiedOnly && n.voiceEnabled);
  const callerId = (all.find((n) => n.isDefault) ?? all[0])?.phoneNumber ?? (env.twilio.defaultNumber || null);
  return { outboundOnly: !purchased, callerId };
}

export async function isOwnedNumber(e164: string) {
  if (e164 === env.twilio.defaultNumber) return true;
  return Boolean(await db.twilioNumber.findUnique({ where: { phoneNumber: e164 } }));
}
