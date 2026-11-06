import type { Metadata } from "next";
import { Badge, Button, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { countryName, flag, formatPhone } from "@/lib/phone";
import { ownedNumbers } from "@/lib/numbers";
import { removeNumber, setDefaultNumber, toggleNumberSms, updateNumberLabel } from "../actions";
import { AddNumberForm, TwilioActions } from "./numbers-client";

export const metadata: Metadata = { title: "Numbers" };

export default async function NumbersPage() {
  await requireAdmin();
  const numbers = await ownedNumbers();
  return (
    <>
      <PageHeader
        title="Numbers"
        sub="Your Twilio numbers. Outbound calls use a number from the destination country when you have one, otherwise the default."
      />
      {numbers.length > 0 && numbers.every((n) => n.verifiedOnly) && (
        <Card className="mb-6 border-coral-tint bg-coral-soft px-5 py-4 text-sm">
          <p className="font-medium">Outbound-only mode — only verified caller IDs, no Twilio number yet</p>
          <p className="mt-1 text-graphite">
            Outbound calls work and show this number as caller ID. Inbound calls, voicemail, missed-call SMS and SMS follow-ups need a number bought in
            Twilio (Phone Numbers → Buy a number, ~$1.15/month for US). Buy one, then Import again and Configure webhooks.
          </p>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title="Owned numbers" />
          {numbers.length === 0 ? (
            <Empty title="No numbers yet">Use “Import from Twilio” or add your US number by hand.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {numbers.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium">
                      {flag(n.country)} {formatPhone(n.phoneNumber)}
                    </p>
                    <form action={updateNumberLabel.bind(null, n.id)} className="mt-1 flex gap-2">
                      <input name="label" defaultValue={n.label ?? ""} placeholder={`Label (e.g. ${countryName(n.country)} sales)`} className="field h-8! py-1! text-[13px]" aria-label="Label" />
                      <Button size="sm" variant="ghost">
                        Save
                      </Button>
                    </form>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n.isDefault ? <Badge tone="dark">Default</Badge> : null}
                    {n.verifiedOnly ? (
                      <Badge tone="outline">Caller ID only</Badge>
                    ) : (
                      <>
                        {n.voiceEnabled ? <Badge>Voice</Badge> : <Badge tone="coral">No voice</Badge>}
                        <form action={toggleNumberSms.bind(null, n.id)}>
                          <button className="cursor-pointer" title="Toggle SMS">
                            <Badge tone={n.smsEnabled ? "positive" : "outline"}>{n.smsEnabled ? "SMS on" : "SMS off"}</Badge>
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!n.isDefault && (
                      <form action={setDefaultNumber.bind(null, n.id)}>
                        <Button size="sm" variant="secondary">
                          Make default
                        </Button>
                      </form>
                    )}
                    <form action={removeNumber.bind(null, n.id)}>
                      <Button size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Twilio" sub={`Webhooks point at ${env.publicBaseUrl}`} />
            <TwilioActions />
          </Card>
          <Card>
            <CardHeader title="Add a number" sub="Buy it in Twilio first, then add it here." />
            <AddNumberForm />
          </Card>
        </div>
      </div>
    </>
  );
}
