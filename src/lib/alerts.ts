import "server-only";
import { Resend } from "resend";
import { db } from "./db";
import { env } from "./env";
import { log } from "./log";
import { alertSmsSender } from "./numbers";
import { formatPhone } from "./phone";
import { twilioClient } from "./twilio";

async function sendEmail(to: string[], subject: string, text: string, html?: string) {
  if (!env.resendApiKey || to.length === 0) return;
  try {
    const resend = new Resend(env.resendApiKey);
    const { error } = await resend.emails.send({ from: env.alertEmailFrom, to, subject, text, html });
    if (error) log.error("alert email failed", error, { subject });
  } catch (err) {
    log.error("alert email failed", err, { subject });
  }
}

async function sendSms(to: string[], body: string) {
  if (!env.alertSmsEnabled || to.length === 0) return;
  const from = await alertSmsSender();
  if (!from) {
    log.warn("alert sms skipped: no SMS-capable Twilio number (verified caller IDs can't send SMS)");
    return;
  }
  await Promise.all(
    to.map((phone) =>
      twilioClient()
        .messages.create({ to: phone, from, body })
        .catch((err) => log.error("alert sms failed", err, { to: phone })),
    ),
  );
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Missed inbound call → SMS + email to every active team member, at most once per call
 * (guarded by call_logs.alert_sent_at).
 */
export async function sendMissedCallAlert(logId: string, reason: "no_answer" | "nobody_online" | "caller_hung_up") {
  const claimed = await db.callLog.updateMany({
    where: { id: logId, alertSentAt: null },
    data: { alertSentAt: new Date() },
  });
  if (claimed.count === 0) return; // already alerted

  const call = await db.callLog.findUnique({ where: { id: logId }, include: { contact: true } });
  if (!call) return;
  const members = await db.teamMember.findMany({ where: { active: true } });

  const who = call.contact ? `${call.contact.businessName} (${formatPhone(call.fromNumber)})` : formatPhone(call.fromNumber);
  const why =
    reason === "nobody_online" ? "nobody was online" : reason === "caller_hung_up" ? "caller hung up before anyone answered" : "nobody answered";
  const link = `${env.publicBaseUrl}/calls/${call.id}`;

  await Promise.all([
    sendSms(
      members.map((m) => m.alertPhone).filter((p): p is string => Boolean(p)),
      `Missed call from ${who} — ${why}. Call back: ${link}`,
    ),
    sendEmail(
      members.map((m) => m.email),
      `Missed call from ${who}`,
      `Missed inbound call from ${who} at ${call.startedAt.toUTCString()} — ${why}.\nIf they leave a voicemail it will appear on the call page.\n\n${link}`,
      `<p>Missed inbound call from <strong>${esc(who)}</strong> at ${esc(call.startedAt.toUTCString())} — ${esc(why)}.</p><p>If they leave a voicemail it will appear on the call page.</p><p><a href="${link}">Open call &amp; call back</a></p>`,
    ),
  ]);
  log.info("missed call alert sent", { logId, reason });
}

/** Voicemail recorded → email only (the SMS for the missed call already went out). */
export async function sendVoicemailAlert(logId: string) {
  const call = await db.callLog.findUnique({ where: { id: logId }, include: { contact: true } });
  if (!call) return;
  const members = await db.teamMember.findMany({ where: { active: true } });
  const who = call.contact ? `${call.contact.businessName} (${formatPhone(call.fromNumber)})` : formatPhone(call.fromNumber);
  const link = `${env.publicBaseUrl}/calls/${call.id}`;
  await sendEmail(
    members.map((m) => m.email),
    `New voicemail from ${who}`,
    `${who} left a ${call.recordingDuration ?? 0}s voicemail.\nListen: ${link}`,
    `<p><strong>${esc(who)}</strong> left a ${call.recordingDuration ?? 0}s voicemail.</p><p><a href="${link}">Listen &amp; call back</a></p>`,
  );
}

/** Daily digest of a member's due follow-ups (called by /api/cron/follow-ups). */
export async function sendFollowUpDigest(
  member: { email: string; name: string },
  items: { businessName: string; phoneNumber: string; nextFollowUpAt: Date | null; id: string }[],
) {
  if (items.length === 0) return;
  const lines = items.map(
    (c) => `• ${c.businessName} — ${formatPhone(c.phoneNumber)} — due ${c.nextFollowUpAt?.toUTCString() ?? ""}\n  ${env.publicBaseUrl}/contacts/${c.id}`,
  );
  await sendEmail(
    [member.email],
    `${items.length} follow-up${items.length === 1 ? "" : "s"} due today`,
    `Hi ${member.name},\n\nThese follow-ups are due:\n\n${lines.join("\n")}\n`,
    `<p>Hi ${esc(member.name)},</p><p>These follow-ups are due:</p><ul>${items
      .map(
        (c) =>
          `<li><a href="${env.publicBaseUrl}/contacts/${c.id}">${esc(c.businessName)}</a> — ${esc(formatPhone(c.phoneNumber))}</li>`,
      )
      .join("")}</ul>`,
  );
}

/** Monthly budget reached 80% / 100% → email admins. */
export async function sendBudgetAlert(threshold: number, spentMicros: number, budgetMicros: number) {
  const admins = await db.teamMember.findMany({ where: { active: true, role: "admin" } });
  const spent = `$${(spentMicros / 1_000_000).toFixed(2)}`;
  const budget = `$${(budgetMicros / 1_000_000).toFixed(2)}`;
  const link = `${env.publicBaseUrl}/spend`;
  const head =
    threshold >= 100
      ? `Monthly call budget reached: ${spent} of ${budget}`
      : `${threshold}% of monthly call budget used: ${spent} of ${budget}`;
  await sendEmail(
    admins.map((a) => a.email),
    head,
    `${head}.\nCalls are not blocked. Review spend: ${link}`,
    `<p><strong>${esc(head)}</strong>.</p><p>Calls are not blocked.</p><p><a href="${link}">Review spend</a></p>`,
  );
}
