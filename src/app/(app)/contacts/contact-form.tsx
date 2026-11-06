"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Button, buttonClass, Card, Label } from "@/components/ui";
import { countryName, flag, parsePhone } from "@/lib/phone";
import { STAGES } from "@/lib/stages";
import type { ContactFormState } from "./actions";

export type ContactDefaults = {
  businessName?: string;
  contactPerson?: string | null;
  website?: string | null;
  country?: string | null;
  phoneNumber?: string;
  email?: string | null;
  issueIdentified?: string | null;
  researchNotes?: string | null;
  stage?: string;
  nextFollowUpAt?: string; // datetime-local in app TZ
  assignedToId?: string | null;
};

export function ContactForm({
  action,
  defaults = {},
  members,
  cancelHref,
  submitLabel,
}: {
  action: (prev: ContactFormState, form: FormData) => Promise<ContactFormState>;
  defaults?: ContactDefaults;
  members: { id: string; name: string }[];
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [phone, setPhone] = useState(defaults.phoneNumber ?? "");
  const [country, setCountry] = useState(defaults.country ?? "");
  const parsed = useMemo(() => parsePhone(phone, country || null), [phone, country]);
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => fe[k] && <p className="mt-1 text-[13px] text-coral-ink">{fe[k]}</p>;

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="space-y-4 p-5">
        <h2 className="font-display text-[15px] font-semibold">Business</h2>
        <div>
          <Label htmlFor="businessName">Business name</Label>
          <input id="businessName" name="businessName" required defaultValue={defaults.businessName} className="field" />
          {err("businessName")}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <div>
            <Label htmlFor="phoneNumber" hint="with country code">
              Phone
            </Label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 20 7123 4567"
              className="field"
              inputMode="tel"
            />
            {err("phoneNumber") ??
              (phone && (
                <p className="mt-1 text-[13px] text-ash">
                  {parsed ? `${flag(parsed.country)} ${parsed.international}${parsed.country ? ` · ${countryName(parsed.country)}` : ""}` : "Not a complete number yet"}
                </p>
              ))}
          </div>
          <div>
            <Label htmlFor="country" hint="ISO">
              Country
            </Label>
            <input
              id="country"
              name="country"
              maxLength={2}
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder={parsed?.country ?? "GB"}
              className="field uppercase"
            />
            {err("country")}
          </div>
        </div>
        {fe.phoneNumber?.startsWith("Already saved") && (
          <label className="flex items-center gap-2 text-[13px] text-graphite">
            <input type="checkbox" name="allowDuplicate" value="1" /> Save anyway (different person, same number)
          </label>
        )}
        <div>
          <Label htmlFor="website">Website</Label>
          <input id="website" name="website" defaultValue={defaults.website ?? ""} placeholder="acme.co.uk" className="field" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contactPerson">Contact person</Label>
            <input id="contactPerson" name="contactPerson" defaultValue={defaults.contactPerson ?? ""} className="field" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <input id="email" name="email" type="email" defaultValue={defaults.email ?? ""} className="field" />
            {err("email")}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="stage">Stage</Label>
            <select id="stage" name="stage" defaultValue={defaults.stage ?? "new"} className="field">
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="assignedToId">Owner</Label>
            <select id="assignedToId" name="assignedToId" defaultValue={defaults.assignedToId ?? ""} className="field">
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="nextFollowUpAt">Next follow-up</Label>
          <input id="nextFollowUpAt" name="nextFollowUpAt" type="datetime-local" defaultValue={defaults.nextFollowUpAt ?? ""} className="field" />
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-[15px] font-semibold">Research</h2>
          <p className="mt-0.5 text-[13px] text-ash">What you found before calling. This is also the record of why the business was contacted.</p>
        </div>
        <div>
          <Label htmlFor="issueIdentified">Issue identified</Label>
          <textarea
            id="issueIdentified"
            name="issueIdentified"
            rows={3}
            defaultValue={defaults.issueIdentified ?? ""}
            placeholder="Checkout breaks on mobile; site takes 9s to load; no online booking…"
            className="field"
          />
        </div>
        <div className="flex flex-1 flex-col">
          <Label htmlFor="researchNotes">Research notes</Label>
          <textarea
            id="researchNotes"
            name="researchNotes"
            rows={10}
            defaultValue={defaults.researchNotes ?? ""}
            placeholder="What they do, size, who decides, talking points, links…"
            className="field flex-1"
          />
        </div>
        {state?.error && <p className="text-sm text-coral-ink">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <Link href={cancelHref} className={buttonClass("ghost")}>
            Cancel
          </Link>
          <Button disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        </div>
      </Card>
    </form>
  );
}
