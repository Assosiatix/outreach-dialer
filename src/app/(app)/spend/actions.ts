"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { checkBudget, setMonthlyBudgetMicros } from "@/lib/costs";

export async function saveBudget(_prev: { ok?: string; error?: string } | undefined, form: FormData) {
  await requireAdmin();
  const raw = String(form.get("budget") ?? "").trim().replace(/[$,\s]/g, "");
  if (!raw) {
    await setMonthlyBudgetMicros(null);
    revalidatePath("/spend");
    return { ok: "Budget removed." };
  }
  const usd = Number(raw);
  if (!Number.isFinite(usd) || usd <= 0 || usd > 100_000) return { error: "Enter an amount like 100 or 250.50." };
  await setMonthlyBudgetMicros(Math.round(usd * 1_000_000));
  await checkBudget().catch(() => {});
  revalidatePath("/spend");
  revalidatePath("/");
  return { ok: `Budget set to $${usd.toFixed(2)}/month.` };
}
