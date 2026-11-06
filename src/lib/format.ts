// Display formatting. Server components render on the VPS (UTC), so dates are formatted in the
// team's timezone explicitly (APP_TIMEZONE, default Asia/Karachi).
export const APP_TZ = process.env.APP_TIMEZONE || "Asia/Karachi";

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}

export function fmtDuration(sec: number | null | undefined) {
  const s = Math.max(0, sec ?? 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function fmtRelative(d: Date | string | null | undefined, now = Date.now()) {
  if (!d) return "";
  const diff = new Date(d).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return "just now";
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  return rtf.format(Math.round(diff / 86400_000), "day");
}

/** Start/end of "today" in APP_TZ, as UTC Dates. */
export function todayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const offsetMin = tzOffsetMinutes(now);
  const start = new Date(new Date(`${parts}T00:00:00Z`).getTime() - offsetMin * 60_000);
  const end = new Date(start.getTime() + 86400_000 - 1);
  return { start, end };
}

function tzOffsetMinutes(at: Date) {
  const local = new Date(at.toLocaleString("en-US", { timeZone: APP_TZ }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

/** "2026-11-05T10:00" in APP_TZ for <input type="datetime-local"> defaults. */
export function toLocalInput(d: Date | null | undefined) {
  if (!d) return "";
  const local = new Date(d.getTime() + tzOffsetMinutes(d) * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Parse a datetime-local value entered in APP_TZ back to UTC. */
export function fromLocalInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const asUtc = new Date(`${v}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  return new Date(asUtc.getTime() - tzOffsetMinutes(asUtc) * 60_000);
}

/** Request time for server components (each request renders fresh; keeps render code pure). */
export function requestNow(): number {
  return Date.now();
}
