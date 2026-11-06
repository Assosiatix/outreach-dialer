"use client";

import { useActionState, useState } from "react";
import { XIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { importContacts } from "./actions";

export function ImportCsv() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(importContacts, undefined);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-pop">
            <div className="flex items-start justify-between">
              <h2 className="font-display text-base font-semibold">Import contacts</h2>
              <button onClick={() => setOpen(false)} className="text-ash hover:text-black" aria-label="Close">
                <XIcon size={18} />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-graphite">
              Columns: <code>business_name</code>, <code>phone_number</code> (required), and optionally <code>country</code>, <code>website</code>,{" "}
              <code>contact_person</code>, <code>email</code>, <code>issue_identified</code>, <code>research_notes</code>. Numbers already saved are skipped.
            </p>
            <form action={action} className="mt-4 space-y-3">
              <input type="file" name="file" accept=".csv,text/csv" required className="field" />
              {state?.error && <p className="text-sm text-coral-ink">{state.error}</p>}
              {state?.done && <p className="text-sm text-[oklch(0.42_0.11_158)]">{state.done}</p>}
              <div className="flex justify-end">
                <Button disabled={pending}>{pending ? "Importing…" : "Import"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
