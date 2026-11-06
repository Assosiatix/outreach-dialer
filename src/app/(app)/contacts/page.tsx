import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { CallButton } from "@/components/dialer/call-button";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { Badge, buttonClass, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDateTime, fmtRelative, requestNow } from "@/lib/format";
import { countryName, flag, formatPhone } from "@/lib/phone";
import { STAGES, stageLabel, stageTone } from "@/lib/stages";
import { ImportCsv } from "./import-csv";

export const metadata: Metadata = { title: "Contacts" };

const PAGE = 50;

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const country = typeof sp.country === "string" ? sp.country : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "follow_up";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ContactWhereInput = {
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
            { website: { contains: q, mode: "insensitive" } },
            { phoneNumber: { contains: q.replace(/[^\d+]/g, "") || q } },
            { issueIdentified: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(stage && STAGES.some((s) => s.value === stage) ? { stage: stage as Prisma.EnumContactStageFilter["equals"] } : {}),
    ...(country ? { country } : {}),
  };
  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    sort === "recent"
      ? [{ lastContactedAt: { sort: "desc", nulls: "last" } }]
      : sort === "name"
        ? [{ businessName: "asc" }]
        : sort === "created"
          ? [{ createdAt: "desc" }]
          : [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }];

  const [contacts, total, countries] = await Promise.all([
    db.contact.findMany({ where, orderBy, take: PAGE, skip: (page - 1) * PAGE, include: { assignedTo: { select: { name: true } } } }),
    db.contact.count({ where }),
    db.contact.groupBy({ by: ["country"], _count: true, orderBy: { country: "asc" } }),
  ]);
  const now = requestNow();
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(stage && { stage }), ...(country && { country }), ...(sort && { sort }) });
    for (const [k, v] of Object.entries(over)) p.set(k, String(v));
    return `/contacts?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        sub={`${total} business${total === 1 ? "" : "es"}`}
        actions={
          <>
            <ImportCsv />
            <LinkButton href="/contacts/new">
              <PlusIcon size={16} /> New contact
            </LinkButton>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/contacts">
        <div className="relative min-w-60 flex-1">
          <SearchIcon size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ash" />
          <input name="q" defaultValue={q} placeholder="Search name, website, phone, issue…" className="field pl-9!" />
        </div>
        <select name="stage" defaultValue={stage} className="field w-auto!">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="country" defaultValue={country} className="field w-auto!">
          <option value="">All countries</option>
          {countries
            .filter((c) => c.country)
            .map((c) => (
              <option key={c.country} value={c.country!}>
                {flag(c.country)} {countryName(c.country)} ({c._count})
              </option>
            ))}
        </select>
        <select name="sort" defaultValue={sort} className="field w-auto!">
          <option value="follow_up">Next follow-up</option>
          <option value="recent">Last contacted</option>
          <option value="created">Newest</option>
          <option value="name">Name A–Z</option>
        </select>
        <button className={buttonClass("secondary")}>Apply</button>
      </form>

      <Card className="overflow-hidden">
        {contacts.length === 0 ? (
          <Empty title={q || stage || country ? "No contacts match" : "No contacts yet"}>
            {q || stage || country ? "Try clearing the filters." : "Add a researched business or import a CSV to start calling."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-ash">
                  <th className="px-5 py-3 font-medium">Business</th>
                  <th className="px-3 py-3 font-medium">Phone</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 font-medium">Follow-up</th>
                  <th className="px-3 py-3 font-medium">Last contact</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const overdue = c.nextFollowUpAt && c.nextFollowUpAt.getTime() < now && !["won", "lost"].includes(c.stage);
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface">
                      <td className="px-5 py-3">
                        <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                          {c.businessName}
                        </Link>
                        <p className="max-w-xs truncate text-[13px] text-ash">{c.issueIdentified || c.website?.replace(/^https?:\/\//, "") || "No research yet"}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="mr-1.5">{flag(c.country)}</span>
                        {formatPhone(c.phoneNumber)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={stageTone(c.stage)}>{stageLabel(c.stage)}</Badge>
                      </td>
                      <td className={`px-3 py-3 whitespace-nowrap ${overdue ? "font-medium text-coral-ink" : "text-graphite"}`}>
                        {c.nextFollowUpAt ? fmtDateTime(c.nextFollowUpAt) : <span className="text-ash">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-graphite">
                        {c.lastContactedAt ? fmtRelative(c.lastContactedAt) : <span className="text-ash">Never</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <CallButton number={c.phoneNumber} contactId={c.id} label={c.businessName} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
