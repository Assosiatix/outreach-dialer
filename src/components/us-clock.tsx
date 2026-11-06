"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

const ZONES = [
  { tz: "America/New_York", label: "Eastern" },
  { tz: "America/Chicago", label: "Central" },
  { tz: "America/Denver", label: "Mountain" },
  { tz: "America/Los_Angeles", label: "Pacific" },
] as const;

function hourIn(tz: string, d: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
}
function dayIn(tz: string, d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
}

/**
 * Local time across the continental US, with business hours (Mon–Fri 9–17) highlighted —
 * the team calls from Pakistan, where US mornings are late afternoon.
 */
export function UsClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (!now) return <div className={cx("h-14", className)} />;

  const rows = ZONES.map((z) => {
    const h = hourIn(z.tz, now);
    const day = dayIn(z.tz, now);
    const weekend = day === "Sat" || day === "Sun";
    return {
      ...z,
      time: new Intl.DateTimeFormat("en-US", { timeZone: z.tz, hour: "numeric", minute: "2-digit" }).format(now),
      day,
      open: !weekend && h >= 9 && h < 17,
      late: h < 8 || h >= 21, // avoid calling at all
    };
  });
  const anyOpen = rows.some((r) => r.open);
  const allLate = rows.every((r) => r.late);

  return (
    <div className={cx("rounded-2xl border border-line bg-white px-4 py-3", className)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        <span className="font-medium">US time</span>
        {rows.map((r) => (
          <span key={r.tz} className="tabular-nums" title={r.open ? "Business hours" : "Outside business hours"}>
            <span className={r.open ? "text-[oklch(0.42_0.11_158)]" : "text-ash"}>{r.label}</span>{" "}
            <span className={r.open ? "font-medium text-black" : "text-graphite"}>
              {r.day} {r.time}
            </span>
          </span>
        ))}
      </div>
      <p className={cx("mt-1 text-xs", allLate ? "text-coral-ink" : "text-ash")}>
        {allLate
          ? "It's night across the US — avoid calling now."
          : anyOpen
            ? `Business hours now in: ${rows.filter((r) => r.open).map((r) => r.label).join(", ")}. The area code decides the time zone.`
            : "Outside US business hours (Mon–Fri 9–5) everywhere right now."}
      </p>
    </div>
  );
}
