"use client";

import { useEffect, useState } from "react";
import { fmtRate, fmtUsd } from "@/lib/cost-math";

type Cost = {
  costStatus: "none" | "estimated" | "final";
  finished: boolean;
  rateMicros: number | null;
  billedMinutes: number;
  callMicros: number | null;
  clientMicros: number | null;
  recordingMicros: number | null;
  totalMicros: number | null;
};

/**
 * Admin-only cost line in the wrap-up dialog: shows the estimate right after hang-up, then
 * switches to Twilio's actual charge once it's priced (usually within a minute or two).
 */
export function CallCost({ logId, callSid, number }: { logId?: string; callSid?: string; number?: string }) {
  const [cost, setCost] = useState<Cost | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const q = new URLSearchParams(
      logId ? { logId } : callSid ? { callSid } : number ? { number } : ({} as Record<string, string>),
    );
    const poll = async () => {
      tries++;
      try {
        const res = await fetch(`/api/calls/cost?${q}`);
        if (res.ok) {
          const data: Cost = await res.json();
          if (!alive) return;
          setCost(data);
          if (data.costStatus === "final") return;
        }
      } catch {}
      if (!alive) return;
      if (tries >= 60) return setGaveUp(true); // ~5 minutes; the cron finalizes it later
      timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [logId, callSid, number]);

  if (!cost || cost.costStatus === "none") {
    return <p className="text-[13px] text-ash">Calculating call cost…</p>;
  }
  const final = cost.costStatus === "final";
  return (
    <div className="rounded-xl bg-surface px-4 py-3 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-graphite">{final ? "Charged by Twilio" : gaveUp ? "Estimated (Twilio price pending)" : "Estimated — waiting for Twilio…"}</span>
        <span className="font-display text-base font-semibold tabular-nums">{fmtUsd(cost.totalMicros, { precise: true })}</span>
      </div>
      <p className="mt-1 text-ash tabular-nums">
        {cost.billedMinutes} billed min{cost.rateMicros !== null && ` × ${fmtRate(cost.rateMicros)}`} · call {fmtUsd(cost.callMicros, { precise: true })} · browser{" "}
        {fmtUsd(cost.clientMicros, { precise: true })} · recording {fmtUsd(cost.recordingMicros, { precise: true })}
      </p>
    </div>
  );
}
