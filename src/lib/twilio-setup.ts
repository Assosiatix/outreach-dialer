import "server-only";
import { db } from "./db";
import { env } from "./env";
import { countryOf } from "./phone";
import { twilioClient, webhookUrl } from "./twilio";

let healthCache: { at: number; value: WebhookHealth } | null = null;
export type WebhookHealth = { ok: boolean; expected: string; actual: string | null; reason?: string };

/**
 * Does the TwiML App still point at this deployment? (A tunnel URL changing in dev, or a domain
 * move, silently breaks every outbound call.) Cached 2 minutes.
 */
export async function webhookHealth(force = false): Promise<WebhookHealth | null> {
  if (!force && healthCache && Date.now() - healthCache.at < 2 * 60_000) return healthCache.value;
  let expected: string;
  try {
    expected = webhookUrl("/api/voice");
  } catch {
    return null;
  }
  let value: WebhookHealth;
  try {
    const app = await twilioClient().applications(env.twilio.twimlAppSid).fetch();
    const actual = app.voiceUrl || null;
    value = !expected.startsWith("https://")
      ? { ok: false, expected, actual, reason: "PUBLIC_BASE_URL must be a public https URL (domain or tunnel) for Twilio to reach the app." }
      : actual === expected
        ? { ok: true, expected, actual }
        : { ok: false, expected, actual, reason: "The TwiML App points somewhere else, so outbound calls can't reach this app." };
  } catch (err) {
    value = { ok: false, expected, actual: null, reason: `Couldn't read the TwiML App from Twilio: ${(err as Error).message}` };
  }
  healthCache = { at: Date.now(), value };
  return value;
}

export function clearWebhookHealthCache() {
  healthCache = null;
}

/** Import every number on the Twilio account into twilio_numbers (keeps labels/defaults). */
export async function syncNumbersFromTwilio() {
  const list = await twilioClient().incomingPhoneNumbers.list({ limit: 200 });
  let added = 0;
  for (const n of list) {
    const country = countryOf(n.phoneNumber) ?? "US";
    const existing = await db.twilioNumber.findUnique({ where: { phoneNumber: n.phoneNumber } });
    if (existing) {
      await db.twilioNumber.update({
        where: { id: existing.id },
        data: { voiceEnabled: Boolean(n.capabilities?.voice), smsEnabled: Boolean(n.capabilities?.sms) },
      });
    } else {
      await db.twilioNumber.create({
        data: {
          phoneNumber: n.phoneNumber,
          country,
          label: n.friendlyName && n.friendlyName !== n.phoneNumber ? n.friendlyName : null,
          voiceEnabled: Boolean(n.capabilities?.voice),
          smsEnabled: Boolean(n.capabilities?.sms),
        },
      });
      added++;
    }
  }

  // Verified Caller IDs (numbers you own outside Twilio): outbound caller ID only.
  const verified = await twilioClient().outgoingCallerIds.list({ limit: 200 });
  const purchased = new Set(list.map((n) => n.phoneNumber));
  for (const v of verified) {
    if (purchased.has(v.phoneNumber)) continue;
    const existing = await db.twilioNumber.findUnique({ where: { phoneNumber: v.phoneNumber } });
    if (existing) {
      await db.twilioNumber.update({
        where: { id: existing.id },
        data: { verifiedOnly: true, voiceEnabled: true, smsEnabled: false },
      });
    } else {
      await db.twilioNumber.create({
        data: {
          phoneNumber: v.phoneNumber,
          country: countryOf(v.phoneNumber) ?? "US",
          label: "Verified caller ID",
          voiceEnabled: true,
          smsEnabled: false,
          verifiedOnly: true,
        },
      });
      added++;
    }
  }

  if (!(await db.twilioNumber.findFirst({ where: { isDefault: true } }))) {
    const first =
      (env.twilio.defaultNumber && (await db.twilioNumber.findUnique({ where: { phoneNumber: env.twilio.defaultNumber } }))) ||
      (await db.twilioNumber.findFirst({ orderBy: { createdAt: "asc" } }));
    if (first) await db.twilioNumber.update({ where: { id: first.id }, data: { isDefault: true } });
  }
  return { found: list.length, verified: verified.filter((v) => !purchased.has(v.phoneNumber)).length, added };
}

/**
 * Point the TwiML App and every owned number at this deployment (PUBLIC_BASE_URL).
 * Same as doing it by hand in the Twilio Console.
 */
export async function configureWebhooks() {
  const client = twilioClient();
  const base = env.publicBaseUrl;
  if (!base.startsWith("https://")) {
    throw new Error("PUBLIC_BASE_URL must be an https:// URL Twilio can reach (your domain or a tunnel).");
  }
  await client.applications(env.twilio.twimlAppSid).update({
    voiceUrl: webhookUrl("/api/voice"),
    voiceMethod: "POST",
    statusCallback: webhookUrl("/api/voice/status"),
    statusCallbackMethod: "POST",
  });
  const numbers = await client.incomingPhoneNumbers.list({ limit: 200 });
  for (const n of numbers) {
    await client.incomingPhoneNumbers(n.sid).update({
      voiceUrl: webhookUrl("/api/voice/inbound"),
      voiceMethod: "POST",
      statusCallback: webhookUrl("/api/voice/status"),
      statusCallbackMethod: "POST",
      ...(n.capabilities?.sms ? { smsUrl: webhookUrl("/api/sms/inbound"), smsMethod: "POST" } : {}),
    });
  }
  return { numbers: numbers.length, base };
}
