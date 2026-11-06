"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPhone } from "@/lib/phone";
import { STAGES } from "@/lib/stages";
import { XIcon } from "../icons";
import { Button, Label } from "../ui";
import { CallCost } from "./call-cost";
import { useDialer } from "./dialer-provider";
import { FollowUpPicker } from "./follow-up-picker";

type Outcome = { logId: string; status: string; label: string; finished: boolean; connected: boolean; problem: string | null };

/** Poll how the call ended (Twilio's final status lands a second or two after hang-up). */
function useOutcome(w: { logId?: string; callSid?: string; number: string; direction: string } | null) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const logId = w?.logId;
  const callSid = w?.callSid;
  const number = w?.direction === "outbound" ? w?.number : undefined;
  useEffect(() => {
    if (!logId && !callSid && !number) return;
    let alive = true;
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    const q = new URLSearchParams(logId ? { logId } : callSid ? { callSid } : { number: number! });
    const poll = async () => {
      tries++;
      try {
        const r = await fetch(`/api/calls/outcome?${q}`);
        if (r.ok) {
          const d: Outcome = await r.json();
          if (!alive) return;
          setOutcome(d);
          if (d.finished) return;
        }
      } catch {}
      if (alive && tries < 20) t = setTimeout(poll, 1500);
    };
    t = setTimeout(poll, 800);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [logId, callSid, number]);
  return outcome;
}

/** After every call: notes + outcome go back onto the contact record (Calling Philosophy #2). */
export function WrapUpDialog({ isAdmin = false }: { isAdmin?: boolean }) {
  const { wrapUp, dismissWrapUp } = useDialer();
  const router = useRouter();
  const [notes, setNotes] = useState("");
  // "Keep current": a connected call already moves New/Researched → Contacted on the server, and a
  // default here would silently downgrade Follow-up / Won contacts.
  const [stage, setStage] = useState<string>("");
  const [followUp, setFollowUp] = useState<string | null | undefined>(undefined);
  const [businessName, setBusinessName] = useState("");
  const [reachedVoicemail, setReachedVoicemail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outcome = useOutcome(wrapUp);

  if (!wrapUp) return null;
  const minutes = Math.floor(wrapUp.durationSec / 60);
  const seconds = wrapUp.durationSec % 60;

  async function save() {
    if (!wrapUp) return;
    setSaving(true);
    setError(null);
    const body = {
      callSid: wrapUp.callSid,
      number: wrapUp.direction === "outbound" ? wrapUp.number : undefined,
      logId: wrapUp.logId ?? outcome?.logId,
      notes: notes || undefined,
      stage: stage || undefined,
      reachedVoicemail: reachedVoicemail || undefined,
      nextFollowUpAt: followUp,
      newContact: !wrapUp.contactId && businessName.trim() ? { businessName: businessName.trim() } : undefined,
    };
    // The call log row can lag a moment behind the browser hanging up; retry briefly.
    for (let i = 0; i < 4; i++) {
      const res = await fetch("/api/calls/wrapup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        dismissWrapUp();
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status !== 404 || i === 3) {
        setError(data.error ?? "Could not save");
        setSaving(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="wrap-title">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-pop">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="wrap-title" className="font-display text-base font-semibold">
              Wrap up · {wrapUp.label}
            </h2>
            <p className="mt-0.5 text-[13px] text-ash">
              {formatPhone(wrapUp.number)} · {wrapUp.connected ? `talked ${minutes}m ${seconds}s` : "not connected"}
            </p>
          </div>
          <button onClick={() => { dismissWrapUp(); router.refresh(); }} className="text-ash hover:text-black" aria-label="Skip wrap-up">
            <XIcon size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-graphite">Result:</span>
            {outcome ? (
              <span className={outcome.status === "completed" ? "font-medium text-[oklch(0.42_0.11_158)]" : "font-medium text-black"}>{outcome.label}</span>
            ) : (
              <span className="text-ash">checking…</span>
            )}
            {outcome?.problem && <span className="w-full text-coral-ink">{outcome.problem}</span>}
          </div>
          {wrapUp.direction === "outbound" && (outcome?.status === "completed" || (!outcome && wrapUp.connected)) && (
            <label className="flex items-start gap-2 text-[13px] text-graphite">
              <input type="checkbox" className="mt-0.5" checked={reachedVoicemail} onChange={(e) => setReachedVoicemail(e.target.checked)} />
              <span>
                Reached voicemail / answering machine (not a person) — keeps connect-rate stats honest.
              </span>
            </label>
          )}
          {!wrapUp.contactId && (
            <div>
              <Label htmlFor="wu-biz" hint="(optional — saves this number as a contact)">
                Business name
              </Label>
              <input id="wu-biz" className="field" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme Ltd" />
            </div>
          )}
          <div>
            <Label htmlFor="wu-notes">What happened?</Label>
            <textarea
              id="wu-notes"
              className="field"
              rows={4}
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Spoke to the owner, interested in the audit, wants pricing by email…"
            />
          </div>
          {(wrapUp.contactId || businessName.trim()) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="wu-stage">Stage</Label>
                <select id="wu-stage" className="field" value={stage} onChange={(e) => setStage(e.target.value)}>
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
                <FollowUpPicker value={followUp} onChange={setFollowUp} />
              </div>
            </div>
          )}
          {isAdmin && (
            <CallCost
              logId={wrapUp.logId}
              callSid={wrapUp.callSid}
              number={!wrapUp.logId && !wrapUp.callSid && wrapUp.direction === "outbound" ? wrapUp.number : undefined}
            />
          )}
          {error && <p className="text-sm text-coral-ink">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={() => { dismissWrapUp(); router.refresh(); }}>
            Skip
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
