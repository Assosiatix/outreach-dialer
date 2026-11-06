"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { SearchIcon, XIcon } from "@/components/icons";
import { Button, buttonClass, Card, Label, cx } from "@/components/ui";
import { STAGES, stageLabel } from "@/lib/stages";
import { logManualCall } from "./actions";

type C = { id: string; label: string; phone: string; stage: string };

const OUTCOMES = {
  inbound: [
    { value: "completed", label: "We talked" },
    { value: "voicemail", label: "They left a voicemail" },
    { value: "missed", label: "I missed their call" },
  ],
  outbound: [
    { value: "completed", label: "We talked" },
    { value: "voicemail", label: "I left a voicemail" },
    { value: "no_answer", label: "No answer" },
    { value: "busy", label: "Busy" },
  ],
} as const;

function localInput(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export function LogCallForm({ contacts, initialContactId, nowLocal }: { contacts: C[]; initialContactId?: string; nowLocal: string }) {
  const [state, action, pending] = useActionState(logManualCall, undefined);
  const [contactId, setContactId] = useState<string | undefined>(initialContactId);
  const [unknown, setUnknown] = useState(contacts.length === 0);
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [outcome, setOutcome] = useState<string>("completed");
  const [followUp, setFollowUp] = useState("");
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => fe[k] && <p className="mt-1 text-[13px] text-coral-ink">{fe[k]}</p>;

  const selected = contacts.find((c) => c.id === contactId);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return contacts
      .filter((c) => !s || c.label.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)))
      .slice(0, 8);
  }, [q, contacts]);

  const outcomes = OUTCOMES[direction];
  const safeOutcome = outcomes.some((o) => o.value === outcome) ? outcome : "completed";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="outcome" value={safeOutcome} />
      {contactId && !unknown && <input type="hidden" name="contactId" value={contactId} />}
      <input type="hidden" name="nextFollowUpAt" value={followUp} />

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-[15px] font-semibold">Who was it with?</h2>

        {!unknown ? (
          selected ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line-strong px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{selected.label}</p>
                <p className="text-[13px] text-ash">
                  {selected.phone} · {stageLabel(selected.stage)}
                </p>
              </div>
              <button type="button" onClick={() => setContactId(undefined)} className="text-ash hover:text-black" aria-label="Change contact">
                <XIcon size={18} />
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <SearchIcon size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ash" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search business name or phone…"
                  className="field pl-9!"
                  aria-label="Search contacts"
                  autoFocus
                />
              </div>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setContactId(c.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface">
                      <span className="text-sm font-medium">{c.label}</span>
                      <span className="text-[13px] text-ash">{c.phone}</span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && <li className="px-4 py-3 text-sm text-ash">No contact matches.</li>}
              </ul>
              {err("contactId")}
            </div>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phoneNumber" hint="with country code">
                Their number
              </Label>
              <input id="phoneNumber" name="phoneNumber" placeholder="+1 212 555 0147" inputMode="tel" className="field" />
              {err("phoneNumber")}
            </div>
            <div>
              <Label htmlFor="businessName" hint="(saves a new contact)">
                Business name
              </Label>
              <input id="businessName" name="businessName" placeholder="Acme Dental" className="field" />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setUnknown((v) => !v);
            setContactId(undefined);
          }}
          className="text-[13px] font-medium underline underline-offset-2"
        >
          {unknown ? "Pick an existing contact instead" : "Not a saved contact? Enter the number"}
        </button>
        {fe.phoneNumber && !unknown && <p className="text-[13px] text-coral-ink">{fe.phoneNumber}</p>}
      </Card>

      <Card className="space-y-5 p-5">
        <div>
          <Label>Call</Label>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Direction">
            {(
              [
                ["inbound", "They called me", "e.g. a callback on Numero"],
                ["outbound", "I called them", "from my phone / Numero"],
              ] as const
            ).map(([v, title, sub]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={direction === v}
                onClick={() => setDirection(v)}
                className={cx("rounded-xl border px-4 py-3 text-left", direction === v ? "border-black bg-black text-white" : "border-line-strong hover:border-black")}
              >
                <span className="block text-sm font-medium">{title}</span>
                <span className={cx("block text-[13px]", direction === v ? "text-white/70" : "text-ash")}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Outcome</Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Outcome">
            {outcomes.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={safeOutcome === o.value}
                onClick={() => setOutcome(o.value)}
                className={cx("h-9 rounded-full border px-3.5 text-[13px]", safeOutcome === o.value ? "border-black bg-black text-white" : "border-line-strong hover:border-black")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="when">When</Label>
            <input id="when" name="when" type="datetime-local" defaultValue={nowLocal} className="field" required />
            {err("when")}
          </div>
          {safeOutcome === "completed" && (
            <div>
              <Label htmlFor="minutes" hint="approx.">
                Talked for (minutes)
              </Label>
              <input id="minutes" name="minutes" type="number" min={0} max={600} step={0.5} placeholder="3" className="field" />
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="notes">What happened?</Label>
          <textarea id="notes" name="notes" rows={5} className="field" placeholder="Called back about the audit, wants pricing by email, decision maker is the owner…" />
        </div>
      </Card>

      {(selected || unknown) && (
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="stage">Update stage</Label>
            <select id="stage" name="stage" defaultValue="" className="field">
              <option value="">Keep current</option>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Next follow-up</Label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["Tomorrow", 1],
                  ["3 days", 3],
                  ["1 week", 7],
                ] as const
              ).map(([l, n]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setFollowUp(localInput(n))}
                  className={cx("h-8 rounded-full border px-3 text-[13px]", followUp === localInput(n) ? "border-black bg-black text-white" : "border-line-strong hover:border-black")}
                >
                  {l}
                </button>
              ))}
            </div>
            <input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="field" aria-label="Follow-up date and time" />
          </div>
        </Card>
      )}

      {state?.error && <p className="text-sm text-coral-ink">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Link href={selected ? `/contacts/${selected.id}` : "/calls"} className={buttonClass("ghost")}>
          Cancel
        </Link>
        <Button disabled={pending || (!unknown && !selected)}>{pending ? "Saving…" : "Save call"}</Button>
      </div>
    </form>
  );
}
