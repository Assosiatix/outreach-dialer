import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CallStatusBadge, DirectionIcon, RecordingPlayer } from "@/components/call-bits";
import { CallButton } from "@/components/dialer/call-button";
import { ExternalIcon, MessageIcon } from "@/components/icons";
import { Badge, Card, CardHeader, Empty, LinkButton } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtDuration, fmtRelative, requestNow, toLocalInput } from "@/lib/format";
import { countryName, flag, formatPhone } from "@/lib/phone";
import { deleteContact } from "../actions";
import { UsClock } from "@/components/us-clock";
import { inboundMode } from "@/lib/numbers";
import { DeleteContact, FollowUpForm, ResearchEditor, SmsComposer, StageSelect } from "./contact-client";

export async function generateMetadata({ params }: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await db.contact.findUnique({ where: { id }, select: { businessName: true } });
  return { title: c?.businessName ?? "Contact" };
}

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const c = await db.contact.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
      calls: { orderBy: { startedAt: "desc" }, take: 100, include: { teamMember: { select: { name: true } } } },
      smsMessages: { orderBy: { createdAt: "desc" }, take: 100, include: { teamMember: { select: { name: true } } } },
    },
  });
  if (!c) notFound();
  const mode = await inboundMode();

  type Item =
    | { kind: "call"; at: Date; call: (typeof c.calls)[number] }
    | { kind: "sms"; at: Date; sms: (typeof c.smsMessages)[number] };
  const timeline: Item[] = [
    ...c.calls.map((call) => ({ kind: "call" as const, at: call.startedAt, call })),
    ...c.smsMessages.map((sms) => ({ kind: "sms" as const, at: sms.createdAt, sms })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const overdue = c.nextFollowUpAt && c.nextFollowUpAt.getTime() < requestNow() && !["won", "lost"].includes(c.stage);

  return (
    <>
      <div className="mb-6">
        <Link href="/contacts" className="text-[13px] text-ash hover:text-black">
          ← Contacts
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{c.businessName}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-graphite">
              <span>
                {flag(c.country)} {formatPhone(c.phoneNumber)}
                {c.country && <span className="text-ash"> · {countryName(c.country)}</span>}
              </span>
              {c.contactPerson && <span>{c.contactPerson}</span>}
              {c.email && (
                <a href={`mailto:${c.email}`} className="hover:underline">
                  {c.email}
                </a>
              )}
              {c.website && (
                <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  {c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalIcon size={13} />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StageSelect id={c.id} stage={c.stage} />
            <LinkButton href={`/calls/log?contactId=${c.id}`} variant="secondary">
              Log a call
            </LinkButton>
            <LinkButton href={`/contacts/${c.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            <CallButton number={c.phoneNumber} contactId={c.id} label={c.businessName} size="md" />
          </div>
        </div>
      </div>

      {(c.country === "US" || c.phoneNumber.startsWith("+1")) && <UsClock className="mb-6" />}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Research" sub="Read this before you dial." />
            <ResearchEditor id={c.id} issueIdentified={c.issueIdentified ?? ""} researchNotes={c.researchNotes ?? ""} />
          </Card>

          <Card>
            <CardHeader
              title="Follow-up"
              action={c.nextFollowUpAt && <Badge tone={overdue ? "coral" : "neutral"}>{overdue ? "Overdue" : fmtRelative(c.nextFollowUpAt)}</Badge>}
            />
            <div className="px-5 py-4">
              <p className="mb-3 text-sm">
                {c.nextFollowUpAt ? (
                  <>
                    Next: <span className="font-medium">{fmtDateTime(c.nextFollowUpAt)}</span>
                  </>
                ) : (
                  <span className="text-ash">No follow-up scheduled.</span>
                )}
              </p>
              <FollowUpForm id={c.id} current={toLocalInput(c.nextFollowUpAt)} />
            </div>
          </Card>

          <Card className="px-5 py-4 text-[13px] text-ash">
            <dl className="grid grid-cols-2 gap-y-2">
              <dt>Owner</dt>
              <dd className="text-black">{c.assignedTo?.name ?? "Anyone"}</dd>
              <dt>Last contacted</dt>
              <dd className="text-black">{c.lastContactedAt ? fmtDateTime(c.lastContactedAt) : "Never"}</dd>
              <dt>Added</dt>
              <dd className="text-black">
                {fmtDate(c.createdAt)}
                {c.createdBy && ` by ${c.createdBy.name}`}
              </dd>
            </dl>
            {me.role === "admin" && <DeleteContact action={deleteContact.bind(null, c.id)} />}
          </Card>
        </div>

        <div className="space-y-6">
          {mode.outboundOnly ? (
            <Card className="px-5 py-4 text-[13px] text-graphite">
              SMS follow-ups need a Twilio number (outbound-only mode). For now, follow up by email
              {c.email && (
                <>
                  {" "}
                  —{" "}
                  <a href={`mailto:${c.email}`} className="font-medium text-black underline underline-offset-2">
                    {c.email}
                  </a>
                </>
              )}
              .
            </Card>
          ) : (
            <Card>
              <CardHeader title="Send SMS" sub="Short follow-up after a call, from a local number when you have one." />
              <SmsComposer contactId={c.id} />
            </Card>
          )}

          <Card>
            <CardHeader title="History" sub={`${c.calls.length} call${c.calls.length === 1 ? "" : "s"} · ${c.smsMessages.length} SMS`} />
            {timeline.length === 0 ? (
              <Empty title="No contact yet">The first call will show up here with its notes.</Empty>
            ) : (
              <ol className="divide-y divide-line">
                {timeline.map((item) =>
                  item.kind === "call" ? (
                    <li key={item.call.id} className="flex gap-3 px-5 py-4">
                      <DirectionIcon direction={item.call.direction} status={item.call.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/calls/${item.call.id}`} className="text-sm font-medium hover:underline">
                            {item.call.direction === "inbound" ? "Inbound call" : "Outbound call"}
                          </Link>
                          <CallStatusBadge status={item.call.status} />
                          {!item.call.callSid && <Badge tone="outline">Manual</Badge>}
                          {item.call.duration > 0 && <span className="text-[13px] text-graphite">{fmtDuration(item.call.duration)}</span>}
                        </div>
                        <p className="mt-0.5 text-[13px] text-ash">
                          {fmtDateTime(item.call.startedAt)}
                          {item.call.teamMember && ` · ${item.call.teamMember.name}`}
                        </p>
                        {item.call.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{item.call.notes}</p>}
                        {item.call.recordingSid && (
                          <div className="mt-2">
                            <RecordingPlayer callId={item.call.id} />
                          </div>
                        )}
                      </div>
                    </li>
                  ) : (
                    <li key={item.sms.id} className="flex gap-3 px-5 py-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-graphite">
                        <MessageIcon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{item.sms.direction === "inbound" ? "SMS reply" : "SMS sent"}</span>
                          <Badge tone={item.sms.status === "failed" || item.sms.status === "undelivered" ? "coral" : "neutral"}>{item.sms.status}</Badge>
                        </div>
                        <p className="mt-0.5 text-[13px] text-ash">
                          {fmtDateTime(item.sms.createdAt)}
                          {item.sms.teamMember && ` · ${item.sms.teamMember.name}`}
                        </p>
                        <p className="mt-2 text-sm whitespace-pre-wrap">{item.sms.body}</p>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
