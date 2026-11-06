"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtRate } from "@/lib/cost-math";
import { useDialer } from "@/components/dialer/dialer-provider";
import { PhoneIcon, XIcon } from "@/components/icons";
import { Button, Card, Label } from "@/components/ui";
import { countryName, flag, parsePhone } from "@/lib/phone";

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["+", ""],
  ["0", ""],
  ["#", ""],
];

export function Keypad({ initial, numbers }: { initial: string; numbers: { phoneNumber: string; label: string }[] }) {
  const { dial, active, deviceState, sendDigit } = useDialer();
  const [value, setValue] = useState(initial);
  const [callerId, setCallerId] = useState("");
  const parsed = useMemo(() => parsePhone(value), [value]);
  const e164 = parsed?.e164 ?? null;
  // Live rate for the typed number (admins see the rate; everyone sees an expensive warning).
  const [rate, setRate] = useState<{ number: string; rateMicros?: number | null; expensive: boolean } | null>(null);
  useEffect(() => {
    if (!e164) return;
    const t = setTimeout(() => {
      fetch(`/api/pricing/rate?number=${encodeURIComponent(e164)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRate({ number: e164, ...d }))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [e164]);
  const shownRate = rate && rate.number === e164 ? rate : null;

  const press = (k: string) => {
    if (active) sendDigit(k);
    else setValue((v) => v + k);
  };
  const call = () => parsed && dial(parsed.e164, { label: parsed.international, callerId: callerId || undefined });

  return (
    <Card className="p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          call();
        }}
      >
        <div className="relative">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="(212) 555-0147 or +44 20…"
            inputMode="tel"
            autoFocus
            aria-label="Phone number"
            className="w-full border-0 bg-transparent py-2 pr-8 text-center font-display text-2xl font-semibold tracking-tight outline-none placeholder:text-ash/50"
          />
          {value && (
            <button type="button" onClick={() => setValue("")} className="absolute top-1/2 right-0 -translate-y-1/2 text-ash hover:text-black" aria-label="Clear">
              <XIcon size={18} />
            </button>
          )}
        </div>
        <p className="h-5 text-center text-[13px] text-ash">
          {value ? (parsed ? `${flag(parsed.country)} ${countryName(parsed.country)}` : "Not a complete number yet (non-US numbers need +country code)") : ""}
          {parsed && shownRate?.rateMicros !== undefined && shownRate.rateMicros !== null && (
            <span className={shownRate.expensive ? "font-medium text-coral-ink" : ""}> · {fmtRate(shownRate.rateMicros)}</span>
          )}
        </p>
        <p className="h-5 text-center text-[13px] text-coral-ink">
          {parsed && shownRate?.expensive ? "Expensive destination — calls here cost much more than US numbers." : ""}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {KEYS.map(([k, sub]) => (
            <button
              type="button"
              key={k}
              onClick={() => press(k)}
              className="flex h-14 flex-col items-center justify-center rounded-2xl bg-surface transition hover:bg-black/[0.06] active:bg-black/10"
            >
              <span className="text-xl font-medium">{k}</span>
              {sub && <span className="text-[10px] tracking-wider text-ash">{sub}</span>}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <Label htmlFor="callerId">Call from</Label>
          <select id="callerId" className="field" value={callerId} onChange={(e) => setCallerId(e.target.value)}>
            <option value="">Auto — local number for the destination country</option>
            {numbers.map((n) => (
              <option key={n.phoneNumber} value={n.phoneNumber}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="call" size="lg" className="mt-5 w-full" disabled={!parsed || Boolean(active) || deviceState !== "ready"}>
          <PhoneIcon size={18} /> {deviceState !== "ready" ? "Dialer not connected" : active ? "On a call" : "Call"}
        </Button>
      </form>
    </Card>
  );
}
