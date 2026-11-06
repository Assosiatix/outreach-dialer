import type { CallStatus, Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { CallStatusBadge, DirectionIcon, RecordingPlayer } from "@/components/call-bits";
import { CallButton } from "@/components/dialer/call-button";
import { Badge, buttonClass, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { flag, formatPhone, countryOf } from "@/lib/phone";
import { reconcileStaleCalls } from "@/lib/reconcile";
import { requireMember } from "@/lib/auth";
import { fmtUsd } from "@/lib/cost-math";
import { estimateUnpriced, syncPendingCosts } from "@/lib/costs";

export const metadata: Metadata = { title: "Calls" };

const PAGE = 50;
const STATUS_FILTERS: Record<string, CallStatus[]> = {
  missed: ["missed", "voicemail"],
  connected: ["completed"],
  unanswered: ["no_answer", "busy", "canceled"],
  failed: ["failed"],
};

export default async function CallsPage({ searchParams }: PageProps<"/calls">) {
  const me = await requireMember();
  const isAdmin = me.role === "admin";
  reconcileStaleCalls().catch(() => {});
  if (isAdmin) {
    await estimateUnpriced().catch(() => {});
    syncPendingCosts().catch(() => {});
  }
  const sp = await searchParams;
  const direction = sp.direction === "inbound" || sp.direction === "outbound" ? sp.direction : "";
  const status = typeof sp.status === "string" && STATUS_FILTERS[sp.status] ? sp.status : "";
  const member = typeof sp.member === "string" ? sp.member : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.CallLogWhereInput = {
    ...(direction ? { direction } : {}),
    ...(status ? { status: { in: STATUS_FILTERS[status] } } : {}),
    ...(member ? { teamMemberId: member } : {}),
  };
  const [calls, total, members] = await Promise.all([
    db.callLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: PAGE,
      skip: (page - 1) * PAGE,
      include: { contact: { select: { id: true, businessName: true } }, teamMember: { select: { name: true } } },
    }),
    db.callLog.count({ where }),
    db.teamMember.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(direction && { direction }), ...(status && { status }), ...(member && { member }) });
    for (const [k, v] of Object.entries(over)) p.set(k, String(v));
    return `/calls?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Calls"
        sub="Every inbound and outbound call, with its outcome."
        actions={
          <LinkButton href="/calls/log" variant="secondary">
            Log a call
          </LinkButton>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/calls">
        <select name="direction" defaultValue={direction} className="field w-auto!">
          <option value="">All directions</option>
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
        </select>
        <select name="status" defaultValue={status} className="field w-auto!">
          <option value="">All outcomes</option>
          <option value="connected">Connected</option>
          <option value="missed">Missed &amp; voicemail</option>
          <option value="unanswered">No answer / busy</option>
          <option value="failed">Failed</option>
        </select>
        <select name="member" defaultValue={member} className="field w-auto!">
          <option value="">Whole team</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button className={buttonClass("secondary")}>Apply</button>
      </form>

      <Card className="overflow-hidden">
        {calls.length === 0 ? (
          <Empty title="No calls yet">Calls you make or receive appear here automatically.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {calls.map((c) => {
              const external = c.direction === "outbound" ? c.toNumber : c.fromNumber;
              const needsAction = c.direction === "inbound" && (c.status === "missed" || c.status === "voicemail") && !c.notes;
              return (
                <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${needsAction ? "bg-coral-soft/60" : ""}`}>
                  <DirectionIcon direction={c.direction} status={c.status} />
                  <div className="min-w-48 flex-1">
                    <Link href={`/calls/${c.id}`} className="text-sm font-medium hover:underline">
                      {c.contact?.businessName ?? formatPhone(external)}
                    </Link>
                    <p className="text-[13px] text-ash">
                      {c.contact && (
                        <>
                          {flag(countryOf(external))} {formatPhone(external)} ·{" "}
                        </>
                      )}
                      {fmtDateTime(c.startedAt)}
                      {c.teamMember && ` · ${c.teamMember.name}`}
                    </p>
                    {c.notes && <p className="mt-1 line-clamp-1 text-[13px] text-graphite">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {!c.callSid && <Badge tone="outline">Manual</Badge>}
                    <CallStatusBadge status={c.status} />
                    <span className="w-14 text-right text-[13px] text-graphite tabular-nums">{c.duration > 0 ? fmtDuration(c.duration) : ""}</span>
                    {isAdmin && (
                      <span
                        className="w-16 text-right text-[13px] font-medium tabular-nums"
                        title={c.costStatus === "final" ? "Charged by Twilio" : c.costStatus === "estimated" ? "Estimate — Twilio price pending" : "Not priced yet"}
                      >
                        {c.costStatus === "estimated" && <span className="text-ash">~</span>}
                        {c.costTotalMicros !== null ? fmtUsd(c.costTotalMicros, { precise: true }) : ""}
                      </span>
                    )}
                  </div>
                  {c.recordingSid && (
                    <div className="w-full sm:w-auto">
                      <RecordingPlayer callId={c.id} />
                    </div>
                  )}
                  {external.startsWith("+") && (
                    <CallButton number={external} contactId={c.contact?.id} label={c.contact?.businessName ?? formatPhone(external)} size="sm" compact />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-graphite">
          <span>
            Page {page} of {Math.ceil(total / PAGE)}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link className={buttonClass("secondary", "sm")} href={qs({ page: page - 1 })}>
                Previous
              </Link>
            )}
            {page * PAGE < total && (
              <Link className={buttonClass("secondary", "sm")} href={qs({ page: page + 1 })}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
