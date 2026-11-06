import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { createContact } from "../actions";
import { ContactForm } from "../contact-form";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage({ searchParams }: PageProps<"/contacts/new">) {
  const { phone } = await searchParams;
  const members = await db.teamMember.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New contact" sub="Research the business first — the caller sees this before dialing." />
      <ContactForm
        action={createContact}
        members={members}
        cancelHref="/contacts"
        submitLabel="Save contact"
        defaults={{ phoneNumber: typeof phone === "string" ? phone : "" }}
      />
    </>
  );
}
