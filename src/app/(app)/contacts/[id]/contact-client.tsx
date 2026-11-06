"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Label } from "@/components/ui";
import { STAGES } from "@/lib/stages";
import { saveResearch, setFollowUp, setStage } from "../actions";

export function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Stage"
      className="field h-10! w-auto! rounded-full! py-0!"
      defaultValue={stage}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => setStage(id, v));
      }}
    >
      {STAGES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function ResearchEditor({ id, issueIdentified, researchNotes }: { id: string; issueIdentified: string; researchNotes: string }) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4 px-5 py-4"
      onChange={() => {
        setDirty(true);
        setSaved(false);
      }}
      action={(fd) =>
        start(async () => {
          await saveResearch(id, fd);
          setDirty(false);
          setSaved(true);
        })
      }
    >
      <div>
        <Label htmlFor="issueIdentified">Issue identified</Label>
        <textarea id="issueIdentified" name="issueIdentified" rows={3} defaultValue={issueIdentified} className="field" placeholder="The specific problem you'll open the call with" />
      </div>
      <div>
        <Label htmlFor="researchNotes">Research notes</Label>
        <textarea id="researchNotes" name="researchNotes" rows={9} defaultValue={researchNotes} className="field" placeholder="What they do, who decides, talking points…" />
      </div>
      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && <span className="text-[13px] text-ash">Saved</span>}
        <Button size="sm" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save research"}
        </Button>
      </div>
    </form>
  );
}

export function FollowUpForm({ id, current }: { id: string; current: string }) {
  const [pending, start] = useTransition();
  const preset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
  };
  const submit = (v: string) => {
    const fd = new FormData();
    fd.set("nextFollowUpAt", v);
    start(() => setFollowUp(id, fd));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[
          ["Tomorrow", 1],
          ["3 days", 3],
          ["1 week", 7],
          ["2 weeks", 14],
        ].map(([l, d]) => (
          <Button key={l} type="button" size="sm" variant="secondary" disabled={pending} onClick={() => submit(preset(d as number))}>
            {l}
          </Button>
        ))}
        {current && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => submit("clear")}>
            Clear
          </Button>
        )}
      </div>
      <form
        className="flex gap-2"
        action={(fd) => {
          const v = String(fd.get("nextFollowUpAt") ?? "");
          if (v) submit(v);
        }}
      >
        <input type="datetime-local" name="nextFollowUpAt" defaultValue={current} className="field" aria-label="Follow-up date and time" />
        <Button size="md" variant="secondary" disabled={pending}>
          Set
        </Button>
      </form>
    </div>
  );
}

export function SmsComposer({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send() {
    setSending(true);
    setMsg(null);
    const res = await fetch("/api/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, body }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setBody("");
      setMsg({ ok: true, text: "Sent" });
      router.refresh();
    } else setMsg({ ok: false, text: data.error ?? "Failed to send" });
  }
  return (
    <div className="space-y-3 px-5 py-4">
      <textarea
        className="field"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1200}
        placeholder="Great speaking with you — here's the link to the audit we discussed…"
        aria-label="SMS message"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[13px] ${msg ? (msg.ok ? "text-[oklch(0.42_0.11_158)]" : "text-coral-ink") : "text-ash"}`}>
          {msg?.text ?? `${body.length}/1200`}
        </span>
        <Button size="sm" onClick={send} disabled={sending || !body.trim()}>
          {sending ? "Sending…" : "Send SMS"}
        </Button>
      </div>
    </div>
  );
}

export function DeleteContact({ action }: { action: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-4 border-t border-line pt-3">
      {confirm ? (
        <form action={action} className="flex items-center gap-2">
          <span className="text-black">Delete contact? Call history stays.</span>
          <Button size="sm" variant="danger">
            Delete
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <button onClick={() => setConfirm(true)} className="text-coral-ink hover:underline">
          Delete contact
        </button>
      )}
    </div>
  );
}
