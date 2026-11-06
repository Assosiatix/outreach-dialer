import "server-only";
import { after } from "next/server";
import { db } from "./db";
import { log } from "./log";
import { estimateCost, toMicros, type CostBreakdown } from "./cost-math";
import { isFinal } from "./call-status";
import { twilioClient, twilioConfigured } from "./twilio";

const RATE_TTL_MS = 30 * 86400_000;

/** Run after the response when inside a request, otherwise fire-and-forget (long-lived VPS process). */
export function background(fn: () => Promise<unknown>) {
  const run = () => fn().catch((err) => log.error("background task failed", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

// ── rates ────────────────────────────────────────────────────────────────

/** Live per-minute rate from Twilio's Pricing API, cached 30 days per number. */
export async function getRate(number: string, kind: "outbound" | "inbound"): Promise<number | null> {
  if (!number.startsWith("+")) return null;
  const cached = await db.voiceRate.findUnique({ where: { number } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < RATE_TTL_MS) {
    const v = kind === "outbound" ? cached.outboundMicros : cached.inboundMicros;
    if (v !== null) return v;
  }
  if (!twilioConfigured()) return null;
  try {
    const r = await twilioClient().pricing.v2.voice.numbers(number).fetch();
    const outbound = toMicros(r.outboundCallPrices?.[0]?.currentPrice);
    const inbound = toMicros((r.inboundCallPrice as { currentPrice?: string } | null)?.currentPrice);
    await db.voiceRate.upsert({
      where: { number },
      create: { number, outboundMicros: outbound, inboundMicros: inbound },
      update: { outboundMicros: outbound, inboundMicros: inbound, fetchedAt: new Date() },
    });
    return kind === "outbound" ? outbound : inbound;
  } catch (err) {
    log.warn("rate lookup failed", { number, error: (err as Error).message });
    return null;
  }
}

/** Store the rate that applies to this call (destination for outbound, our number for inbound). */
export async function captureRate(logId: string) {
  const call = await db.callLog.findUnique({ where: { id: logId } });
  if (!call || call.rateMicros !== null) return;
  const rate =
    call.direction === "outbound" ? await getRate(call.toNumber, "outbound") : await getRate(call.toNumber, "inbound");
  if (rate !== null) await db.callLog.update({ where: { id: logId }, data: { rateMicros: rate } });
}

// ── per-call cost ────────────────────────────────────────────────────────

function breakdownData(b: CostBreakdown) {
  return { costCallMicros: b.call, costClientMicros: b.client, costRecordingMicros: b.recording, costTotalMicros: b.total };
}

/** Immediately after a call ends: estimate from rate × billed minutes, so the cost shows right away. */
export async function estimateAndStore(logId: string) {
  await captureRate(logId);
  const call = await db.callLog.findUnique({ where: { id: logId } });
  if (!call || !isFinal(call.status) || call.costStatus === "final") return;
  const b = estimateCost({
    direction: call.direction,
    status: call.status,
    duration: call.duration,
    recordingDuration: call.recordingDuration,
    rateMicros: call.rateMicros,
  });
  await db.callLog.update({ where: { id: logId }, data: { ...breakdownData(b), costStatus: "estimated" } });
}

type Leg = { price: string | null; duration: string | null; status: string };

function legResolved(l: Leg) {
  // Twilio fills `price` a little after the call ends; a leg that never connected stays null forever.
  return l.price !== null || Number(l.duration ?? 0) === 0 || !["completed"].includes(l.status);
}

/**
 * Replace the estimate with what Twilio actually charged: parent leg + child leg(s) + recordings.
 * Returns true when the cost is now final.
 */
export async function fetchActualCost(logId: string): Promise<boolean> {
  const call = await db.callLog.findUnique({ where: { id: logId } });
  if (!call?.callSid || !isFinal(call.status) || call.costStatus === "final" || !twilioConfigured()) return false;
  const client = twilioClient();

  await db.callLog.update({ where: { id: logId }, data: { costCheckedAt: new Date(), costAttempts: { increment: 1 } } });

  const parent = (await client.calls(call.callSid).fetch()) as unknown as Leg;
  const children = (await client.calls.list({ parentCallSid: call.callSid, limit: 20 })) as unknown as Leg[];
  const recordings = await client.recordings.list({ callSid: call.callSid, limit: 20 });

  const legs = [parent, ...children];
  const allResolved = legs.every(legResolved) && recordings.every((r) => r.price !== null);

  const parentMicros = toMicros(parent.price) ?? 0;
  const childMicros = children.reduce((s, c) => s + (toMicros(c.price) ?? 0), 0);
  const recMicros = recordings.reduce((s, r) => s + (toMicros(r.price) ?? 0), 0);

  // Outbound: parent = browser leg, child = PSTN leg. Inbound: parent = PSTN leg, children = browser legs.
  const b: CostBreakdown =
    call.direction === "outbound"
      ? { call: childMicros, client: parentMicros, recording: recMicros, total: 0 }
      : { call: parentMicros, client: childMicros, recording: recMicros, total: 0 };
  b.total = b.call + b.client + b.recording;

  if (!allResolved) return false;
  await db.callLog.update({ where: { id: logId }, data: { ...breakdownData(b), costStatus: "final" } });
  return true;
}

/**
 * Make sure every finished call has at least an estimate, so totals never silently skip a call.
 * Cheap (rates are cached) and unthrottled — run it before showing any spend numbers.
 */
export async function estimateUnpriced(limit = 200) {
  const rows = await db.callLog.findMany({
    where: {
      costStatus: "none",
      status: { in: ["completed", "no_answer", "busy", "failed", "canceled", "voicemail", "missed"] },
    },
    select: { id: true },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  for (const r of rows) await estimateAndStore(r.id).catch((err) => log.warn("estimate failed", { logId: r.id, error: (err as Error).message }));
  return rows.length;
}

let lastSync = 0;

/**
 * Finalize costs for recently ended calls. Called by the cron (every 10 min), on admin page
 * loads (throttled) and by the wrap-up cost poller. Backs off per call; gives up after 3 days
 * (the estimate stays).
 */
export async function syncPendingCosts(opts: { force?: boolean; limit?: number } = {}) {
  if (!opts.force && Date.now() - lastSync < 2 * 60_000) return;
  lastSync = Date.now();
  if (!twilioConfigured()) return;

  const pending = await db.callLog.findMany({
    where: {
      costStatus: { in: ["none", "estimated"] },
      status: { in: ["completed", "no_answer", "busy", "failed", "canceled", "voicemail", "missed"] },
      endedAt: { lt: new Date(Date.now() - 60_000), gt: new Date(Date.now() - 3 * 86400_000) },
      costAttempts: { lt: 40 },
    },
    orderBy: { endedAt: "desc" },
    take: opts.limit ?? 40,
  });
  for (const c of pending) {
    if (c.costStatus === "none") await estimateAndStore(c.id).catch(() => {});
    const backoffMs = Math.min(c.costAttempts, 10) * 2 * 60_000;
    if (c.costCheckedAt && Date.now() - c.costCheckedAt.getTime() < backoffMs) continue;
    await fetchActualCost(c.id).catch((err) => log.warn("cost fetch failed", { logId: c.id, error: (err as Error).message }));
  }
  await checkBudget().catch((err) => log.error("budget check failed", err));
}

// ── spend & budget ───────────────────────────────────────────────────────

/** Twilio bills by UTC calendar month. */
export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export async function spendSince(from: Date, to?: Date) {
  const r = await db.callLog.aggregate({
    where: { startedAt: { gte: from, ...(to ? { lte: to } : {}) }, costTotalMicros: { not: null } },
    _sum: { costTotalMicros: true },
    _count: true,
  });
  return { micros: r._sum.costTotalMicros ?? 0, calls: r._count };
}

async function getSetting(key: string) {
  return (await db.appSetting.findUnique({ where: { key } }))?.value ?? null;
}
async function setSetting(key: string, value: string) {
  await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getMonthlyBudgetMicros(): Promise<number | null> {
  const v = await getSetting("budget_monthly_micros");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
export async function setMonthlyBudgetMicros(micros: number | null) {
  if (micros && micros > 0) await setSetting("budget_monthly_micros", String(Math.round(micros)));
  else await db.appSetting.deleteMany({ where: { key: "budget_monthly_micros" } });
  // A new budget gets fresh 80% / 100% alerts.
  await db.appSetting.deleteMany({ where: { key: { in: ["budget_alert_80", "budget_alert_100"] } } });
}

export async function budgetStatus() {
  const budget = await getMonthlyBudgetMicros();
  const month = await spendSince(monthStartUtc());
  const pct = budget ? Math.round((month.micros / budget) * 100) : null;
  return { budget, spent: month.micros, calls: month.calls, pct };
}

/** Email admins once at 80% and once at 100% of the monthly budget. Calls are never blocked. */
export async function checkBudget() {
  const { budget, spent, pct } = await budgetStatus();
  if (!budget || pct === null) return;
  const key = monthKey();
  for (const threshold of [80, 100]) {
    if (pct < threshold) continue;
    const settingKey = `budget_alert_${threshold}`;
    if ((await getSetting(settingKey)) === key) continue;
    await setSetting(settingKey, key);
    const { sendBudgetAlert } = await import("./alerts");
    await sendBudgetAlert(threshold, spent, budget);
    log.info("budget alert sent", { threshold, spent, budget });
  }
}

let balanceCache: { at: number; value: { balance: string; currency: string } | null } | null = null;

/** Remaining Twilio account balance (cached 5 min). */
export async function twilioBalance() {
  if (balanceCache && Date.now() - balanceCache.at < 5 * 60_000) return balanceCache.value;
  let value: { balance: string; currency: string } | null = null;
  if (twilioConfigured()) {
    try {
      const b = await twilioClient().balance.fetch();
      value = { balance: b.balance, currency: b.currency };
    } catch (err) {
      log.warn("balance fetch failed", { error: (err as Error).message });
    }
  }
  balanceCache = { at: Date.now(), value };
  return value;
}

