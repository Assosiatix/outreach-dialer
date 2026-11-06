import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { toLocalInput } from "@/lib/format";
import { inboundMode } from "@/lib/numbers";
import { formatPhone } from "@/lib/phone";
import { LogCallForm } from "./log-call-form";

export const metadata: Metadata = { title: "Log a call" };

export default async function LogCallPage({ searchParams }: PageProps<"/calls/log">) {
  const sp = await searchParams;
  const contactId = typeof sp.contactId === "string" ? sp.contactId : undefined;
  const [contacts, mode] = await Promise.all([
    db.contact.findMany({
      select: { id: true, businessName: true, phoneNumber: true, stage: true },
      orderBy: { businessName: "asc" },
      take: 2000,
    }),
    inboundMode(),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Log a call"
        sub={
          <>
            For calls that didn&apos;t go through the dialer — e.g. a prospect calling back
            {mode.callerId ? ` ${formatPhone(mode.callerId)}` : " your number"} in the Numero app. It goes into the contact&apos;s history and
            analytics, at no cost.
          </>
        }
      />
      <LogCallForm
        contacts={contacts.map((c) => ({ id: c.id, label: c.businessName, phone: formatPhone(c.phoneNumber), stage: c.stage }))}
        initialContactId={contacts.some((c) => c.id === contactId) ? contactId : undefined}
        nowLocal={toLocalInput(new Date())}
      />
    </div>
  );
}
