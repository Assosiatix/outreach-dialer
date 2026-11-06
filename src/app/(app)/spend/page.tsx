import type { Metadata } from "next";
import Link from "next/link";
import { CallStatusBadge, DirectionIcon } from "@/components/call-bits";
import { Badge, Card, CardHeader, Empty, PageHeader, cx } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { billedMinutes, fmtRate, fmtUsd } from "@/lib/cost-math";
import { budgetStatus, estimateUnpriced, monthStartUtc, spendSince, syncPendingCosts, twilioBalance } from "@/lib/costs";
import { db } from "@/lib/db";
import { APP_TZ, fmtDateTime, requestNow, todayBounds } from "@/lib/format";
import { countryName, countryOf, flag, formatPhone } from "@/lib/phone";
import { BudgetForm } from "./budget-form";

export const metadata: Metadata = { title: "Spend" };

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function SpendPage() {
  await requireAdmin();
  // Every finished call gets at least an estimate before we total anything (unthrottled, cheap)…
  await estimateUnpriced().catch(() => {});
  // …then Twilio's actual prices replace estimates (throttled, slower).
  await syncPendingCosts().catch(() => {});

  const now = requestNow();
  const { start: todayStart } = todayBounds();
  const monthStart = monthStartUtc();
  const [budget, today, balance, monthCalls, members, recent, pending] = await Promise.all([
    budgetStatus(),
    spendSince(todayStart),
    twilioBalance(),
    db.callLog.findMany({
      where: { startedAt: { gte: monthStart }, callSid: { not: null } }, // manual (non-Twilio) calls cost nothing
      select: { startedAt: true, status: true, duration: true, direction: true, toNumber: true, teamMemberId: true, costTotalMicros: true },
    }),
    db.teamMember.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.callLog.findMany({
      where: { costTotalMicros: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { contact: { select: { businessName: true } }, teamMember: { select: { name: true } } },
    }),
    db.callLog.count({ where: { costStatus: { in: ["none", "estimated"] }, status: { notIn: ["initiated", "ringing", "in_progress"] } } }),
  ]);

  // Averages use only connected calls that have a cost, for numerator and denominator alike.
  const connected = monthCalls.filter((c) => c.status === "completed" && c.costTotalMicros !== null);
  const connectedCost = connected.reduce((s, c) => s + (c.costTotalMicros ?? 0), 0);
  const connectedMinutes = connected.reduce((s, c) => s + billedMinutes(c.duration), 0);
  const avgPerConnected = connected.length ? Math.round(connectedCost / connected.length) : null;
  const perMinute = connectedMinutes ? Math.round(connectedCost / connectedMinutes) : null;

  // Daily spend this month
  const days = new Map<string, number>();
  for (let t = monthStart.getTime(); t <= now; t += 86400_000) days.set(dayKey(new Date(t)), 0);
  for (const c of monthCalls) {
    const k = dayKey(c.startedAt);
    if (days.has(k)) days.set(k, (days.get(k) ?? 0) + (c.costTotalMicros ?? 0));
  }
  const daily = [...days.entries()];
  const maxDay = Math.max(1, ...daily.map(([, v]) => v));

  // By caller and by destination country
  const byMember = members
    .map((m) => {
      const mine = monthCalls.filter((c) => c.teamMemberId === m.id);
      return { ...m, calls: mine.length, micros: mine.reduce((s, c) => s + (c.costTotalMicros ?? 0), 0) };
    })
    .filter((m) => m.calls);
  const byCountry = new Map<string, { calls: number; micros: number }>();
  for (const c of monthCalls.filter((x) => x.direction === "outbound")) {
    const k = countryOf(c.toNumber) ?? "??";
    const v = byCountry.get(k) ?? { calls: 0, micros: 0 };
    v.calls++;
    v.micros += c.costTotalMicros ?? 0;
    byCountry.set(k, v);
  }
  const countries = [...byCountry.entries()].sort((a, b) => b[1].micros - a[1].micros).slice(0, 8);

  // Month-end projection at the current daily pace
  const dayOfMonth = Math.max(1, new Date(now).getUTCDate());
  const daysInMonth = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 0)).getUTCDate();
  const projected = Math.round((budget.spent / dayOfMonth) * daysInMonth);
  const pct = budget.pct ?? 0;

  return (
    <>
      <PageHeader title="Spend" sub="What Twilio charges for every call. Estimates turn into Twilio's actual price a few minutes after each call." />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <p className="text-[13px] text-graphite">This month (UTC, as Twilio bills)</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-3xl font-semibold tabular-nums">{fmtUsd(budget.spent)}</span>
            {budget.budget && <span className="text-sm text-graphite">of {fmtUsd(budget.budget)} budget</span>}
          </div>
          {budget.budget ? (
            <>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className={cx("h-full rounded-full", pct >= 100 ? "bg-coral" : pct >= 80 ? "bg-coral-ink" : "bg-black")} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <p className="mt-2 text-[13px] text-graphite">
                {pct}% used · at this pace ≈ <span className="font-medium text-black">{fmtUsd(projected)}</span> by month end
                {pct >= 80 && <span className="text-coral-ink"> · {pct >= 100 ? "budget reached" : "over 80%"}</span>}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-ash">No monthly budget set. At this pace ≈ {fmtUsd(projected)} by month end.</p>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[13px] text-ash">Today</dt>
              <dd className="font-medium tabular-nums">{fmtUsd(today.micros)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ash">Avg per connected call</dt>
              <dd className="font-medium tabular-nums">{fmtUsd(avgPerConnected, { precise: true })}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ash">Effective per minute</dt>
              <dd className="font-medium tabular-nums">{fmtRate(perMinute)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ash">Twilio balance</dt>
              <dd className="font-medium tabular-nums">{balance ? `$${Number(balance.balance).toFixed(2)}` : "—"}</dd>
            </div>
          </dl>
          {pending > 0 && <p className="mt-3 text-xs text-ash">{pending} call{pending === 1 ? "" : "s"} still estimated — totals include the estimate until Twilio prices them.</p>}
        </Card>

        <Card>
          <CardHeader title="Monthly budget" sub="Admins get an email at 80% and 100%. Calls are never blocked." />
          <BudgetForm current={budget.budget} />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Spend per day" sub="This month. Hover a bar for the amount." />
        <div className="px-5 pt-6 pb-4">
          <div className="flex h-40 items-end gap-[2px]" role="img" aria-label="Spend per day bar chart">
            {daily.map(([k, v]) => (
              <div key={k} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t-[4px] bg-graphite group-hover:bg-black" style={{ height: `${(v / maxDay) * 100}%`, minHeight: v ? 2 : 0 }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-black px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-pop group-hover:block">
                  {k}: {fmtUsd(v, { precise: true })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs text-ash">
            <span>{daily[0]?.[0]}</span>
            <span>max {fmtUsd(maxDay)}/day</span>
            <span>{daily[daily.length - 1]?.[0]}</span>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By caller" sub="This month" />
          {byMember.length === 0 ? (
            <Empty title="No calls this month" />
          ) : (
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {byMember.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-medium">{m.name}</td>
                    <td className="px-2 py-2.5 text-right text-graphite">{m.calls} calls</td>
                    <td className="px-5 py-2.5 text-right">{fmtUsd(m.micros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardHeader title="By destination" sub="Outbound, this month" />
          {countries.length === 0 ? (
            <Empty title="No outbound calls this month" />
          ) : (
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {countries.map(([code, v]) => (
                  <tr key={code} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      {flag(code)} {countryName(code) || "Unknown"}
                    </td>
                    <td className="px-2 py-2.5 text-right text-graphite">{v.calls} calls</td>
                    <td className="px-5 py-2.5 text-right">{fmtUsd(v.micros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent calls" sub="~ means estimated; Twilio's actual price replaces it shortly after the call." />
        {recent.length === 0 ? (
          <Empty title="No priced calls yet" />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((c) => {
              const external = c.direction === "outbound" ? c.toNumber : c.fromNumber;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <DirectionIcon direction={c.direction} status={c.status} />
                  <div className="min-w-44 flex-1">
                    <Link href={`/calls/${c.id}`} className="text-sm font-medium hover:underline">
                      {c.contact?.businessName ?? formatPhone(external)}
                    </Link>
                    <p className="text-[13px] text-ash">
                      {fmtDateTime(c.startedAt)}
                      {c.teamMember && ` · ${c.teamMember.name}`}
                      {c.rateMicros !== null && ` · ${fmtRate(c.rateMicros)}`}
                    </p>
                  </div>
                  <CallStatusBadge status={c.status} />
                  <span className="w-12 text-right text-[13px] text-graphite tabular-nums">{billedMinutes(c.duration)} min</span>
                  <span className="w-20 text-right text-sm font-medium tabular-nums">
                    {c.costStatus === "estimated" && <span className="text-ash">~</span>}
                    {fmtUsd(c.costTotalMicros, { precise: true })}
                  </span>
                  {c.costStatus === "final" ? <Badge tone="positive">Twilio</Badge> : <Badge tone="outline">Estimate</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
