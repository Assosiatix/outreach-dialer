import type { Metadata } from "next";
import Link from "next/link";
import { CallStatusBadge, DirectionIcon } from "@/components/call-bits";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { countryName, formatPhone } from "@/lib/phone";
import { ownedNumbers } from "@/lib/numbers";
import { Keypad } from "./keypad";
import { UsClock } from "@/components/us-clock";

export const metadata: Metadata = { title: "Dialer" };

export default async function DialerPage({ searchParams }: PageProps<"/dialer">) {
  const me = await requireMember();
  const { number } = await searchParams;
  const [numbers, recent] = await Promise.all([
    ownedNumbers(),
    db.callLog.findMany({
      where: { teamMemberId: me.id },
      orderBy: { startedAt: "desc" },
      take: 12,
      include: { contact: { select: { id: true, businessName: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="Dialer" sub="Dial any number. Saved contacts are matched automatically." />
      <UsClock className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Keypad
          key={typeof number === "string" ? number : ""}
          initial={typeof number === "string" ? number : ""}
          numbers={numbers.filter((n) => n.voiceEnabled).map((n) => ({
            phoneNumber: n.phoneNumber,
            label: `${n.label ? `${n.label} · ` : ""}${formatPhone(n.phoneNumber)} (${countryName(n.country)})`,
          }))}
        />
        <Card>
          <CardHeader title="Your recent calls" />
          {recent.length === 0 ? (
            <Empty title="No calls yet" />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((c) => {
                const external = c.direction === "outbound" ? c.toNumber : c.fromNumber;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <DirectionIcon direction={c.direction} status={c.status} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/calls/${c.id}`} className="text-sm font-medium hover:underline">
                        {c.contact?.businessName ?? formatPhone(external)}
                      </Link>
                      <p className="text-[13px] text-ash">{fmtDateTime(c.startedAt)}</p>
                    </div>
                    <CallStatusBadge status={c.status} />
                    <Link href={`/dialer?number=${encodeURIComponent(external)}`} className="text-[13px] text-graphite hover:text-black hover:underline">
                      Redial
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
