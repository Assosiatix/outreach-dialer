import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { toLocalInput } from "@/lib/format";
import { updateContact } from "../../actions";
import { ContactForm } from "../../contact-form";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  const { id } = await params;
  const [c, members] = await Promise.all([
    db.contact.findUnique({ where: { id } }),
    db.teamMember.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`Edit ${c.businessName}`} />
      <ContactForm
        action={updateContact.bind(null, c.id)}
        members={members}
        cancelHref={`/contacts/${c.id}`}
        submitLabel="Save changes"
        defaults={{ ...c, nextFollowUpAt: toLocalInput(c.nextFollowUpAt) }}
      />
    </>
  );
}
