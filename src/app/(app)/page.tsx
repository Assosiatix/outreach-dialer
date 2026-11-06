import type { Metadata } from "next";
import Link from "next/link";
import { CallStatusBadge, RecordingPlayer } from "@/components/call-bits";
import { CallButton } from "@/components/dialer/call-button";
import { Badge, buttonClass, Card, CardHeader, Empty, LinkButton } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime, fmtDuration, fmtRelative, fmtTime, todayBounds, APP_TZ, requestNow } from "@/lib/format";
import { flag, formatPhone } from "@/lib/phone";
import { reconcileStaleCalls } from "@/lib/reconcile";
import { twilioConfigured } from "@/lib/twilio";
import { inboundMode } from "@/lib/numbers";
import { fmtUsd } from "@/lib/cost-math";
import { budgetStatus, estimateUnpriced, spendSince } from "@/lib/costs";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const me = await requireMember();
  reconcileStaleCalls().catch(() => {});
  const { start, end } = todayBounds();
  const mine = { OR: [{ assignedToId: me.id }, { assignedToId: null }] };

  const [followUps, attention, ready, myToday, numberCount] = await Promise.all([
    db.contact.findMany({
      where: { nextFollowUpAt: { lte: end }, stage: { notIn: ["won", "lost"] }, ...mine },
      orderBy: { nextFollowUpAt: "asc" },
      take: 25,
    }),
    db.callLog.findMany({
      where: {
        direction: "inbound",
        status: { in: ["missed", "voicemail"] },
        notes: null,
        startedAt: { gte: new Date(requestNow() - 7 * 86400_000) },
      },
      orderBy: { startedAt: "desc" },
      take: 15,
      include: { contact: { select: { id: true, businessName: true } } },
    }),
    db.contact.findMany({
      where: { stage: "researched", lastContactedAt: null, ...mine },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.callLog.findMany({
      where: { teamMemberId: me.id, startedAt: { gte: start, lte: end } },
      select: { status: true, duration: true },
    }),
    db.twilioNumber.count(),
  ]);

  const connected = myToday.filter((c) => c.status === "completed").length;
  const talk = myToday.reduce((s, c) => s + c.duration, 0);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const configured = twilioConfigured();
  const mode = await inboundMode();
  const isAdmin = me.role === "admin";
  if (isAdmin) await estimateUnpriced().catch(() => {});
  const [spendToday, budget] = isAdmin ? await Promise.all([spendSince(start), budgetStatus()]) : [null, null];

  return (
    <>
      <div className="mb-8">
        {isAdmin && spendToday && budget && (
          <Link href="/spend" className="float-right mt-1 hidden text-right text-[13px] text-graphite hover:text-black sm:block">
            <span className="font-medium text-black tabular-nums">{fmtUsd(spendToday.micros)}</span> today ·{" "}
            <span className="tabular-nums">{fmtUsd(budget.spent)}</span> this month
            {budget.budget && <span className="tabular-nums"> / {fmtUsd(budget.budget)}</span>}
          </Link>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {greeting}, {me.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-graphite">
          {myToday.length === 0
            ? "No calls yet today."
            : `Today: ${myToday.length} call${myToday.length === 1 ? "" : "s"}, ${connected} connected, ${fmtDuration(talk)} talk time.`}{" "}
          {followUps.length > 0 && `${followUps.length} follow-up${followUps.length === 1 ? "" : "s"} due.`}
        </p>
      </div>

      {isAdmin && budget?.pct !== null && budget?.pct !== undefined && budget.pct >= 80 && (
        <Card className="mb-6 border-coral-tint bg-coral-soft px-5 py-4 text-sm">
          <p className="font-medium">
            {budget.pct >= 100 ? "Monthly call budget reached" : `${budget.pct}% of this month's call budget used`}
          </p>
          <p className="mt-0.5 text-graphite">
            {fmtUsd(budget.spent)} of {fmtUsd(budget.budget)} spent. Calls are not blocked.{" "}
            <Link href="/spend" className="underline">
              Review spend
            </Link>
          </p>
        </Card>
      )}

      {(!configured || numberCount === 0) && (
        <Card className="mb-6 border-coral-tint bg-coral-soft/50 px-5 py-4">
          <p className="font-medium">Finish setup to start calling</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-graphite">
            {!configured && <li>Add your Twilio keys to <code>.env</code> (see README → Twilio setup) and restart the app.</li>}
            {numberCount === 0 && (
              <li>
                {me.role === "admin" ? (
                  <Link href="/settings/numbers" className="underline">
                    Add your Twilio number
                  </Link>
                ) : (
                  "Ask an admin to add the Twilio number"
                )}{" "}
                so the dialer knows which caller ID to use.
              </li>
            )}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Follow-ups due" sub="Overdue and today. Yours and unassigned." action={<LinkButton href="/contacts" variant="ghost" size="sm">All contacts</LinkButton>} />
          {followUps.length === 0 ? (
            <Empty title="All caught up">Follow-ups you schedule after calls show up here on the day.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {followUps.map((c) => {
                const overdue = c.nextFollowUpAt! < start;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:underline">
                        {c.businessName}
                      </Link>
                      <p className="truncate text-[13px] text-ash">{c.issueIdentified || formatPhone(c.phoneNumber)}</p>
                    </div>
                    <span className={`text-[13px] whitespace-nowrap ${overdue ? "font-medium text-coral-ink" : "text-graphite"}`}>
                      {overdue ? fmtRelative(c.nextFollowUpAt) : fmtTime(c.nextFollowUpAt)}
                    </span>
                    <CallButton number={c.phoneNumber} contactId={c.id} label={c.businessName} size="sm" compact />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {mode.outboundOnly ? (
          <Card className="px-5 py-4">
            <p className="font-display text-[15px] font-semibold">Outbound-only mode</p>
            <p className="mt-1 text-sm leading-relaxed text-graphite">
              Inbound calls, voicemail and missed-call alerts are off because there is no Twilio number yet — calls go out with your verified caller ID
              {mode.callerId && <> ({formatPhone(mode.callerId)})</>}. When a prospect calls that number back it rings in the Numero app that owns the
              number, so log the conversation on the contact afterwards. Keep the Numero subscription active — if the number lapses, outbound calls stop working.
            </p>
            <p className="mt-2 text-[13px] text-ash">To turn inbound on later: buy a US number in Twilio (~$1.15/month), then Numbers → Import from Twilio → Configure webhooks.</p>
            <Link href="/calls/log" className={`${buttonClass("secondary", "sm")} mt-3`}>
              Log a callback
            </Link>
          </Card>
        ) : (
        <Card>
          <CardHeader
            title="Missed calls to handle"
            sub="Inbound calls nobody answered. Add a note once handled."
            action={attention.length > 0 && <Badge tone="coral">{attention.length}</Badge>}
          />
          {attention.length === 0 ? (
            <Empty title="No missed calls">Inbound calls that go to voicemail land here until someone writes them up.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((c) => (
                <li key={c.id} className="space-y-2 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/calls/${c.id}`} className="text-sm font-medium hover:underline">
                        {c.contact?.businessName ?? formatPhone(c.fromNumber)}
                      </Link>
                      <p className="text-[13px] text-ash">{fmtDateTime(c.startedAt)}</p>
                    </div>
                    <CallStatusBadge status={c.status} />
                    {c.fromNumber.startsWith("+") && (
                      <CallButton number={c.fromNumber} contactId={c.contact?.id} label={c.contact?.businessName ?? formatPhone(c.fromNumber)} size="sm" compact />
                    )}
                  </div>
                  {c.recordingSid && <RecordingPlayer callId={c.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader title="Researched, not yet called" sub="Research done — ready for a first call." />
          {ready.length === 0 ? (
            <Empty title="Nothing waiting">
              Set a contact&apos;s stage to <em>Researched</em> once you&apos;ve studied the business.
            </Empty>
          ) : (
            <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
              {ready.map((c) => (
                <li key={c.id} className="flex items-start gap-3 border-line px-5 py-3 sm:border-b">
                  <div className="min-w-0 flex-1">
                    <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:underline">
                      {flag(c.country)} {c.businessName}
                    </Link>
                    <p className="line-clamp-2 text-[13px] text-ash">{c.issueIdentified ?? "No issue noted"}</p>
                  </div>
                  <CallButton number={c.phoneNumber} contactId={c.id} label={c.businessName} size="sm" compact />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
