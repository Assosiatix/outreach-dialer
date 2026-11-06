import type { CallStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, Empty, PageHeader, cx } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/call-status";
import { db } from "@/lib/db";
import { APP_TZ, fmtDuration, requestNow } from "@/lib/format";
import { countryName, countryOf, flag } from "@/lib/phone";
import { STAGES } from "@/lib/stages";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [7, 30, 90] as const;

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 30;
  const now = requestNow();
  const since = new Date(now - days * 86400_000);

  const [calls, members, stageCounts] = await Promise.all([
    db.callLog.findMany({
      where: { startedAt: { gte: since } },
      select: { direction: true, status: true, duration: true, teamMemberId: true, startedAt: true, toNumber: true },
    }),
    db.teamMember.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.contact.groupBy({ by: ["stage"], _count: true }),
  ]);

  const outbound = calls.filter((c) => c.direction === "outbound");
  const inbound = calls.filter((c) => c.direction === "inbound");

  // Per agent
  const agents = members
    .map((m) => {
      const out = outbound.filter((c) => c.teamMemberId === m.id);
      const conn = out.filter((c) => c.status === "completed");
      const inAns = inbound.filter((c) => c.teamMemberId === m.id && c.status === "completed");
      const talk = [...conn, ...inAns].reduce((s, c) => s + c.duration, 0);
      return { ...m, out: out.length, conn: conn.length, inAns: inAns.length, talk, avg: conn.length ? Math.round(conn.reduce((s, c) => s + c.duration, 0) / conn.length) : 0 };
    })
    .filter((a) => a.out || a.inAns);

  // Daily volume (outbound + inbound)
  const byDay = new Map<string, { total: number; connected: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(new Date(now - i * 86400_000)), { total: 0, connected: 0 });
  for (const c of calls) {
    const k = dayKey(c.startedAt);
    const d = byDay.get(k);
    if (d) {
      d.total++;
      if (c.status === "completed") d.connected++;
    }
  }
  const daily = [...byDay.entries()];
  const maxDay = Math.max(1, ...daily.map(([, v]) => v.total));

  // Outbound outcomes
  const outcomeOrder: CallStatus[] = ["completed", "no_answer", "busy", "voicemail", "canceled", "failed"];
  const outcomes = outcomeOrder.map((s) => ({ s, n: outbound.filter((c) => c.status === s).length })).filter((o) => o.n);
  const maxOutcome = Math.max(1, ...outcomes.map((o) => o.n));

  // Destination countries
  const countryMap = new Map<string, { n: number; conn: number }>();
  for (const c of outbound) {
    const k = countryOf(c.toNumber) ?? "??";
    const v = countryMap.get(k) ?? { n: 0, conn: 0 };
    v.n++;
    if (c.status === "completed") v.conn++;
    countryMap.set(k, v);
  }
  const countries = [...countryMap.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);

  const inAnswered = inbound.filter((c) => c.status === "completed").length;
  const inVoicemail = inbound.filter((c) => c.status === "voicemail").length;
  const inMissed = inbound.filter((c) => c.status === "missed").length;
  const outConnected = outbound.filter((c) => c.status === "completed").length;
  const talkTotal = calls.filter((c) => c.status === "completed").reduce((s, c) => s + c.duration, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        sub={`Last ${days} days`}
        actions={
          <div className="flex rounded-full border border-line-strong bg-white p-0.5" role="tablist" aria-label="Range">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/analytics?days=${r}`}
                role="tab"
                aria-selected={r === days}
                className={cx("rounded-full px-3.5 py-1.5 text-[13px] font-medium", r === days ? "bg-black text-white" : "text-graphite hover:text-black")}
              >
                {r} days
              </Link>
            ))}
          </div>
        }
      />

      {calls.length === 0 ? (
        <Card>
          <Empty title="No calls in this period">Numbers appear once the team starts calling.</Empty>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-[15px] leading-relaxed text-graphite">
            <span className="font-semibold text-black">{outbound.length}</span> outbound calls,{" "}
            <span className="font-semibold text-black">{outConnected}</span> connected ({pct(outConnected, outbound.length)}).{" "}
            <span className="font-semibold text-black">{inbound.length}</span> inbound, {inAnswered} answered ({pct(inAnswered, inbound.length)}),{" "}
            {inVoicemail} voicemail, {inMissed} missed. <span className="font-semibold text-black">{fmtDuration(talkTotal)}</span> total talk time.
          </p>

          <Card>
            <CardHeader title="Calls per day" sub="Inbound and outbound. Hover a bar for connected count." />
            <div className="px-5 pt-6 pb-4">
              <div className="flex h-44 items-end gap-[2px]" role="img" aria-label="Calls per day bar chart">
                {daily.map(([k, v]) => (
                  <div key={k} className="group relative flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px] bg-graphite transition-colors group-hover:bg-black"
                      style={{ height: `${(v.total / maxDay) * 100}%`, minHeight: v.total ? 2 : 0 }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-black px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-pop group-hover:block">
                      <p className="font-medium">{k}</p>
                      <p>
                        {v.total} calls · {v.connected} connected
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs text-ash">
                <span>{daily[0]?.[0]}</span>
                <span>max {maxDay}/day</span>
                <span>{daily[daily.length - 1]?.[0]}</span>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Per caller" />
              {agents.length === 0 ? (
                <Empty title="No calls by team members" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[13px] text-ash">
                        <th className="px-5 py-2.5 font-medium">Caller</th>
                        <th className="px-2 py-2.5 text-right font-medium">Outbound</th>
                        <th className="px-2 py-2.5 text-right font-medium">Connected</th>
                        <th className="px-2 py-2.5 text-right font-medium">Inbound</th>
                        <th className="px-2 py-2.5 text-right font-medium">Avg call</th>
                        <th className="px-5 py-2.5 text-right font-medium">Talk time</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {agents.map((a) => (
                        <tr key={a.id} className="border-b border-line last:border-0">
                          <td className="px-5 py-2.5 font-medium">{a.name}</td>
                          <td className="px-2 py-2.5 text-right">{a.out}</td>
                          <td className="px-2 py-2.5 text-right">
                            {a.conn} <span className="text-ash">({pct(a.conn, a.out)})</span>
                          </td>
                          <td className="px-2 py-2.5 text-right">{a.inAns}</td>
                          <td className="px-2 py-2.5 text-right">{a.avg ? fmtDuration(a.avg) : "—"}</td>
                          <td className="px-5 py-2.5 text-right">{fmtDuration(a.talk)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Outbound outcomes" />
              <ul className="space-y-3 px-5 py-4">
                {outcomes.map((o) => (
                  <li key={o.s} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-3 text-sm">
                    <span className="text-graphite">{STATUS_LABEL[o.s]}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-black/[0.05]">
                      <span className="block h-full rounded-full bg-graphite" style={{ width: `${(o.n / maxOutcome) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      {o.n} <span className="text-ash">{pct(o.n, outbound.length)}</span>
                    </span>
                  </li>
                ))}
                {outcomes.length === 0 && <li className="text-sm text-ash">No outbound calls.</li>}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Destinations" sub="Outbound by country, with connect rate — low rates may need a local number." />
              <table className="w-full text-sm">
                <tbody className="tabular-nums">
                  {countries.map(([code, v]) => (
                    <tr key={code} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">
                        {flag(code)} {countryName(code) || "Unknown"}
                      </td>
                      <td className="px-2 py-2.5 text-right">{v.n} calls</td>
                      <td className="px-5 py-2.5 text-right">{pct(v.conn, v.n)} connected</td>
                    </tr>
                  ))}
                  {countries.length === 0 && (
                    <tr>
                      <td className="px-5 py-4 text-ash">No outbound calls.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card>
              <CardHeader title="Pipeline" sub="All contacts by current stage." />
              <ul className="divide-y divide-line">
                {STAGES.map((s) => (
                  <li key={s.value} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <Link href={`/contacts?stage=${s.value}`} className="hover:underline">
                      {s.label}
                    </Link>
                    <span className="tabular-nums">{stageCounts.find((x) => x.stage === s.value)?._count ?? 0}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
