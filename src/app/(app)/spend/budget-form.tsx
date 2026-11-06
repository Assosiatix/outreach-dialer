"use client";

import { useActionState } from "react";
import { Button, Label } from "@/components/ui";
import { saveBudget } from "./actions";

export function BudgetForm({ current }: { current: number | null }) {
  const [state, action, pending] = useActionState(saveBudget, undefined);
  return (
    <form action={action} className="space-y-3 px-5 py-4">
      <div>
        <Label htmlFor="budget" hint="USD, leave empty for none">
          Budget per month
        </Label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ash">$</span>
          <input
            id="budget"
            name="budget"
            inputMode="decimal"
            defaultValue={current ? (current / 1_000_000).toFixed(2) : ""}
            placeholder="100.00"
            className="field pl-7!"
          />
        </div>
      </div>
      <p className="text-[13px] text-ash">For reference: 100 US calls/day × 2 min ≈ $4.10/day ≈ $90 per 22 working days.</p>
      {state?.error && <p className="text-[13px] text-coral-ink">{state.error}</p>}
      {state?.ok && <p className="text-[13px] text-[oklch(0.42_0.11_158)]">{state.ok}</p>}
      <Button size="sm" disabled={pending}>
        Save budget
      </Button>
    </form>
  );
}
