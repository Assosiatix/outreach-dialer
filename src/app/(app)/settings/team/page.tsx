import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveStatus } from "@/lib/presence";
import { AddMemberForm, MemberRow } from "./team-client";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const members = await db.teamMember.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader title="Team" sub="Who can sign in and call. Alert phone receives missed-call SMS; everyone gets the email." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title={`${members.filter((m) => m.active).length} active`} />
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const st = effectiveStatus(m.status, m.lastSeenAt);
              return (
                <MemberRow
                  key={m.id}
                  isMe={m.id === me.id}
                  member={{ id: m.id, name: m.name, email: m.email, role: m.role, alertPhone: m.alertPhone ?? "", active: m.active }}
                  badge={
                    !m.active ? (
                      <Badge tone="outline">Deactivated</Badge>
                    ) : (
                      <Badge tone={st === "online" ? "positive" : st === "on_call" ? "coral" : "neutral"}>
                        {st === "online" ? "Available" : st === "on_call" ? "On a call" : st === "away" ? "Away" : "Offline"}
                      </Badge>
                    )
                  }
                />
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Add team member" />
          <AddMemberForm />
        </Card>
      </div>
    </>
  );
}
