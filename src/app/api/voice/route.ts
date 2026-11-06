// POST /api/voice — TwiML App Voice URL. Twilio calls this when a browser client places a call
// (device.connect). We log the call and return <Dial> to the real destination with caller ID.
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { contactForNumber } from "@/lib/calls";
import { background, captureRate, getRate } from "@/lib/costs";
import { pickCallerId } from "@/lib/numbers";
import { parsePhone } from "@/lib/phone";
import { riskyDestination } from "@/lib/phone-risk";
import { forbidden, memberIdFromIdentity, readTwilioRequest, twiml, VoiceResponse, webhookUrl } from "@/lib/twilio";
import { sayAndHangup } from "@/lib/voice";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();

  const callSid = p.CallSid;
  try {
    const memberId = memberIdFromIdentity(p.From ?? p.Caller);
    const member = memberId ? await db.teamMember.findUnique({ where: { id: memberId } }) : null;
    if (!member || !member.active) {
      log.warn("outbound from unknown client", { from: p.From, callSid });
      return twiml(sayAndHangup("This dialer account is not authorized."));
    }

    const parsed = parsePhone(p.To ?? "");
    const contact = p.contactId
      ? await db.contact.findUnique({ where: { id: p.contactId } })
      : parsed
        ? await contactForNumber(parsed.e164)
        : null;

    if (!parsed) {
      await db.callLog.upsert({
        where: { callSid },
        create: {
          callSid,
          direction: "outbound",
          teamMemberId: member.id,
          contactId: contact?.id,
          fromNumber: "",
          toNumber: p.To ?? "",
          status: "failed",
          errorMessage: "Invalid destination number",
          endedAt: new Date(),
        },
        update: {},
      });
      return twiml(sayAndHangup("That number is not valid. Please check the country code."));
    }

    // Cost / toll-fraud guard: refuse destinations above MAX_CALL_RATE_USD per minute
    // (premium-rate and some satellite numbers cost dollars per minute). Rates are cached.
    const rate = await getRate(parsed.e164, "outbound");
    const risky = rate === null ? riskyDestination(parsed.e164) : null;
    if ((rate !== null && rate > env.maxCallRateMicros) || risky) {
      await db.callLog.upsert({
        where: { callSid },
        create: {
          callSid,
          direction: "outbound",
          teamMemberId: member.id,
          contactId: contact?.id,
          fromNumber: "",
          toNumber: parsed.e164,
          status: "failed",
          rateMicros: rate,
          errorMessage:
            rate !== null
              ? `Blocked: this destination costs $${(rate / 1_000_000).toFixed(3)}/min (limit $${(env.maxCallRateMicros / 1_000_000).toFixed(2)}). An admin can raise MAX_CALL_RATE_USD.`
              : `Blocked: ${risky} — these can cost dollars per minute and Twilio didn't quote a rate.`,
          endedAt: new Date(),
          costStatus: "final",
          costTotalMicros: 0,
        },
        update: {},
      });
      log.warn("outbound blocked by rate limit", { to: parsed.e164, rate, member: member.id });
      return twiml(sayAndHangup("This destination is blocked because it is too expensive."));
    }

    const callerId = await pickCallerId(parsed.e164, p.callerId || null);
    if (!callerId) {
      await db.callLog.upsert({
        where: { callSid },
        create: {
          callSid,
          direction: "outbound",
          teamMemberId: member.id,
          contactId: contact?.id,
          fromNumber: "",
          toNumber: parsed.e164,
          status: "failed",
          errorMessage: "No Twilio caller ID configured",
          endedAt: new Date(),
        },
        update: {},
      });
      return twiml(sayAndHangup("No caller I D number is configured for this dialer."));
    }

    const call = await db.callLog.upsert({
      where: { callSid },
      create: {
        callSid,
        direction: "outbound",
        teamMemberId: member.id,
        contactId: contact?.id,
        fromNumber: callerId,
        toNumber: parsed.e164,
        status: "initiated",
      },
      update: {},
    });

    const r = new VoiceResponse();
    const dial = r.dial({
      callerId,
      answerOnBridge: true,
      timeout: 45,
      action: webhookUrl("/api/voice/dial-action", { logId: call.id }),
      method: "POST",
      ...(env.callRecording
        ? {
            record: "record-from-answer-dual" as const,
            recordingStatusCallback: webhookUrl("/api/voice/recording", { logId: call.id }),
            recordingStatusCallbackMethod: "POST" as const,
            recordingStatusCallbackEvent: ["completed"],
          }
        : {}),
    });
    dial.number(
      {
        statusCallback: webhookUrl("/api/voice/dial-status", { logId: call.id }),
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        // Recording notice to the called party on answer (consent). Off when not recording.
        ...(env.callRecording && env.recordingNotice ? { url: webhookUrl("/api/voice/notice"), method: "POST" as const } : {}),
      },
      parsed.e164,
    );
    // Look up the destination's live per-minute rate after responding (keeps TwiML fast).
    background(() => captureRate(call.id));
    log.info("outbound call", { logId: call.id, member: member.id, to: parsed.e164, callerId });
    return twiml(r.toString());
  } catch (err) {
    log.error("outbound /api/voice failed", err, { callSid });
    return twiml(sayAndHangup("Sorry, the call could not be placed. Please try again."));
  }
}
