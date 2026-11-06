// POST /api/voice/inbound — Voice webhook of every Twilio number we own.
// Simul-rings every online team member's browser; nobody online → straight to voicemail.
// Every inbound call is logged before anything else happens (no silent drops).
import { after } from "next/server";
import { sendMissedCallAlert } from "@/lib/alerts";
import { contactForNumber } from "@/lib/calls";
import { background, captureRate } from "@/lib/costs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { formatPhone } from "@/lib/phone";
import { ringableMembers } from "@/lib/presence";
import { forbidden, identityFor, readTwilioRequest, twiml, VoiceResponse, webhookUrl } from "@/lib/twilio";
import { sayAndHangup, voicemailTwiml } from "@/lib/voice";

export async function POST(req: Request) {
  const p = await readTwilioRequest(req);
  if (!p) return forbidden();
  const callSid = p.CallSid;

  let logId: string | null = null;
  try {
    const from = p.From ?? "";
    const contact = await contactForNumber(from);
    const call = await db.callLog.upsert({
      where: { callSid },
      create: {
        callSid,
        direction: "inbound",
        contactId: contact?.id,
        fromNumber: from,
        toNumber: p.To ?? p.Called ?? "",
        status: "ringing",
      },
      update: {},
    });
    logId = call.id;
    background(() => captureRate(call.id));

    const members = await ringableMembers();
    if (members.length === 0) {
      await db.callLog.update({ where: { id: call.id }, data: { status: "missed" } });
      after(() => sendMissedCallAlert(call.id, "nobody_online"));
      log.info("inbound: nobody online → voicemail", { logId: call.id, from });
      return twiml(voicemailTwiml(call.id));
    }

    const r = new VoiceResponse();
    const dial = r.dial({
      timeout: env.inboundRingTimeout,
      answerOnBridge: true,
      action: webhookUrl("/api/voice/inbound/after-dial", { logId: call.id }),
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
    const label = contact ? contact.businessName : formatPhone(from);
    for (const m of members) {
      const client = dial.client({
        statusCallback: webhookUrl("/api/voice/inbound/client-status", { logId: call.id }),
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["answered", "completed"],
      });
      client.identity(identityFor(m.id));
      client.parameter({ name: "logId", value: call.id });
      client.parameter({ name: "label", value: label.slice(0, 80) });
      if (contact) client.parameter({ name: "contactId", value: contact.id });
    }
    log.info("inbound: ringing", { logId: call.id, from, members: members.map((m) => m.id) });
    return twiml(r.toString());
  } catch (err) {
    log.error("inbound failed", err, { callSid, logId });
    // Never drop the caller: fall back to voicemail if we at least have a log row.
    if (logId) {
      const id = logId;
      after(() => sendMissedCallAlert(id, "no_answer"));
      return twiml(voicemailTwiml(id));
    }
    return twiml(sayAndHangup("Sorry, we are having technical trouble. Please call again shortly."));
  }
}
