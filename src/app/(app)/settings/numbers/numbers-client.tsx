"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Label } from "@/components/ui";
import { addNumber, applyWebhooks, syncNumbers, type Msg } from "../actions";

function Result({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <p className={`text-[13px] ${msg.error ? "text-coral-ink" : "text-[oklch(0.42_0.11_158)]"}`}>{msg.error ?? msg.ok}</p>;
}

/** Run a server action with a timeout so the UI never stays on "Talking to Twilio…". */
async function runSafely(fn: () => Promise<Msg>): Promise<Msg> {
  try {
    return await Promise.race([
      fn(),
      new Promise<Msg>((resolve) =>
        setTimeout(() => resolve({ error: "No response after 30s. Open the app at http://localhost:3100 (not the tunnel URL) and try again." }), 30_000),
      ),
    ]);
  } catch (err) {
    return { error: `Request failed: ${(err as Error).message}. Reload the page and try again.` };
  }
}

export function TwilioActions() {
  const [msg, setMsg] = useState<Msg>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-[13px] leading-relaxed text-graphite">
        <strong>Import</strong> pulls every number on your Twilio account. <strong>Configure webhooks</strong> points the TwiML App and all numbers (voice, status, SMS) at this
        app — run it after deploying or changing the domain.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setMsg(await runSafely(syncNumbers)))}>
          Import from Twilio
        </Button>
        <Button size="sm" disabled={pending} onClick={() => start(async () => setMsg(await runSafely(applyWebhooks)))}>
          Configure webhooks
        </Button>
      </div>
      {pending ? <p className="text-[13px] text-ash">Talking to Twilio…</p> : <Result msg={msg} />}
    </div>
  );
}

export function AddNumberForm() {
  const [state, action, pending] = useActionState(addNumber, undefined);
  return (
    <form action={action} className="space-y-3 px-5 py-4">
      <div>
        <Label htmlFor="n-phone">Number</Label>
        <input id="n-phone" name="phoneNumber" required placeholder="+1 415 555 0100" className="field" />
      </div>
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <div>
          <Label htmlFor="n-label">Label</Label>
          <input id="n-label" name="label" placeholder="US main" className="field" />
        </div>
        <div>
          <Label htmlFor="n-country">Country</Label>
          <input id="n-country" name="country" maxLength={2} placeholder="auto" className="field uppercase" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-graphite">
        <input type="checkbox" name="smsEnabled" /> Can send SMS
      </label>
      <Result msg={state} />
      <Button size="sm" disabled={pending}>
        Add number
      </Button>
    </form>
  );
}
