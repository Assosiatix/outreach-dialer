import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CallStatusBadge, DirectionIcon, RecordingPlayer } from "@/components/call-bits";
import { CallButton } from "@/components/dialer/call-button";
import { Badge, Button, Card, CardHeader, LinkButton } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { billedMinutes, fmtRate, fmtUsd } from "@/lib/cost-math";
import { syncPendingCosts } from "@/lib/costs";
import { explainTwilioError } from "@/lib/call-status";
import { db } from "@/lib/db";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { countryName, countryOf, flag, formatPhone } from "@/lib/phone";
import { createContactFromCall, saveCallNotes } from "../actions";

export const metadata: Metadata = { title: "Call" };

export default async function CallPage({ params }: PageProps<"/calls/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (me.role === "admin") await syncPendingCosts().catch(() => {});
  const c = await db.callLog.findUnique({
    where: { id },
    include: { contact: true, teamMember: { select: { name: true } } },
  });
  if (!c) notFound();
  const external = c.direction === "outbound" ? c.toNumber : c.fromNumber;
  const country = countryOf(external);
  const errorHelp = explainTwilioError(c.errorCode);

  return (
    <div className="max-w-3xl">
      <Link href="/calls" className="text-[13px] text-ash hover:text-black">
        ← Calls
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <DirectionIcon direction={c.direction} status={c.status} />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{c.contact?.businessName ?? formatPhone(external)}</h1>
            <p className="mt-1 text-sm text-graphite">
              {c.direction === "inbound" ? "Inbound" : "Outbound"} · {fmtDateTime(c.startedAt)}
              {c.teamMember && ` · ${c.teamMember.name}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {c.contact && (
            <LinkButton href={`/contacts/${c.contact.id}`} variant="secondary">
              Open contact
            </LinkButton>
          )}
          {external.startsWith("+") && <CallButton number={external} contactId={c.contact?.id} label={c.contact?.businessName ?? formatPhone(external)} />}
        </div>
      </div>

      <div className="space-y-6">
        <Card className="px-5 py-4">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2.5 text-sm">
            <dt className="text-ash">Outcome</dt>
            <dd>
              <CallStatusBadge status={c.status} />
            </dd>
            <dt className="text-ash">{c.direction === "inbound" ? "Caller" : "Called"}</dt>
            <dd>
              {flag(country)} {formatPhone(external)} {country && <span className="text-ash">· {countryName(country)}</span>}
            </dd>
            <dt className="text-ash">{c.direction === "inbound" ? "Called our" : "Caller ID"}</dt>
            <dd>{formatPhone(c.direction === "inbound" ? c.toNumber : c.fromNumber) || "—"}</dd>
            <dt className="text-ash">Talk time</dt>
            <dd>{c.duration ? fmtDuration(c.duration) : "—"}</dd>
            {(c.errorCode || c.errorMessage) && (
              <>
                <dt className="text-ash">Problem</dt>
                <dd className="text-coral-ink">
                  {errorHelp ?? c.errorMessage}
                  {c.errorCode && <span className="text-ash"> (Twilio {c.errorCode})</span>}
                </dd>
              </>
            )}
          </dl>
          {c.recordingSid && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-[13px] font-medium text-graphite">{c.status === "voicemail" ? "Voicemail" : "Recording"}</p>
              <RecordingPlayer callId={c.id} />
            </div>
          )}
        </Card>

        {!c.callSid && (
          <Card className="px-5 py-4 text-sm text-graphite">
            <Badge tone="outline">Manual</Badge>
            <span className="ml-2">Logged by hand — this call didn&apos;t go through Twilio (e.g. a callback on Numero), so it has no recording and no cost.</span>
          </Card>
        )}

        {me.role === "admin" && c.callSid && (
          <Card>
            <CardHeader
              title="Cost"
              action={
                c.costStatus === "final" ? (
                  <Badge tone="positive">Charged by Twilio</Badge>
                ) : c.costStatus === "estimated" ? (
                  <Badge tone="outline">Estimate</Badge>
                ) : (
                  <Badge tone="outline">Not priced yet</Badge>
                )
              }
            />
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 px-5 py-4 text-sm tabular-nums">
              <dt className="text-graphite">
                {c.direction === "outbound" ? "Call to destination" : "Inbound call leg"} · {billedMinutes(c.duration)} billed min
                {c.rateMicros !== null && ` × ${fmtRate(c.rateMicros)}`}
              </dt>
              <dd className="text-right">{fmtUsd(c.costCallMicros, { precise: true })}</dd>
              <dt className="text-graphite">Browser (Twilio Client) leg</dt>
              <dd className="text-right">{fmtUsd(c.costClientMicros, { precise: true })}</dd>
              <dt className="text-graphite">Recording</dt>
              <dd className="text-right">{fmtUsd(c.costRecordingMicros, { precise: true })}</dd>
              <dt className="border-t border-line pt-2 font-medium">Total</dt>
              <dd className="border-t border-line pt-2 text-right font-semibold">{fmtUsd(c.costTotalMicros, { precise: true })}</dd>
            </dl>
            {c.costStatus !== "final" && (
              <p className="px-5 pb-4 text-xs text-ash">Twilio prices a call a few minutes after it ends; this page shows the actual charge after that.</p>
            )}
          </Card>
        )}

        <Card>
          <CardHeader title="Notes" sub={c.direction === "inbound" && !c.notes && c.status !== "completed" ? "Write what you did about this call (e.g. called back) so your teammate knows it's handled." : undefined} />
          <form action={saveCallNotes.bind(null, c.id)} className="space-y-3 px-5 py-4">
            <textarea name="notes" rows={5} defaultValue={c.notes ?? ""} className="field" aria-label="Call notes" placeholder="What was said, next step…" />
            <div className="flex justify-end">
              <Button size="sm">Save notes</Button>
            </div>
          </form>
        </Card>

        {!c.contact && external.startsWith("+") && (
          <Card>
            <CardHeader title="Save as contact" sub="Unknown number. Create a contact so future calls show their record." />
            <form action={createContactFromCall.bind(null, c.id)} className="flex gap-2 px-5 py-4">
              <input name="businessName" required placeholder="Business name" className="field" aria-label="Business name" />
              <Button>Create</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
