// Pure cost math. Money is integer micro-dollars (1 USD = 1_000_000) so sums never drift.
// No DB / Twilio imports → unit-testable and safe in client components.

export const MICROS = 1_000_000;

/** Browser (Twilio Client) leg — observed on this account: $0.004/min. */
export const CLIENT_RATE_MICROS = 4_000;
/** Call recording — Twilio list price: $0.0025/recorded min. */
export const RECORDING_RATE_MICROS = 2_500;
/** US inbound to a local number, used only until the real rate is looked up. */
export const DEFAULT_INBOUND_RATE_MICROS = 8_500;
/** Destinations above this per-minute rate get an "expensive" warning before dialing. */
export const EXPENSIVE_RATE_MICROS = 50_000;

/** Twilio price strings are negative for charges ("-0.18000"). */
export function toMicros(price: string | number | null | undefined): number | null {
  if (price === null || price === undefined || price === "") return null;
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * MICROS);
}

/** Twilio bills every started minute. */
export function billedMinutes(seconds: number | null | undefined): number {
  const s = seconds ?? 0;
  return s > 0 ? Math.ceil(s / 60) : 0;
}

export type CostBreakdown = { call: number; client: number; recording: number; total: number };

export function estimateCost(input: {
  direction: "inbound" | "outbound";
  status: string;
  /** Talk time of the bridged leg (seconds). */
  duration: number;
  recordingDuration: number | null;
  /** Outbound: destination rate. Inbound: our number's inbound rate. */
  rateMicros: number | null;
}): CostBreakdown {
  const rec = billedMinutes(input.recordingDuration) * RECORDING_RATE_MICROS;
  let call = 0;
  let client = 0;

  if (input.direction === "outbound") {
    // answerOnBridge: both legs are billed only for connected time.
    const m = input.status === "completed" ? billedMinutes(input.duration) : 0;
    call = m * (input.rateMicros ?? 0);
    client = m * CLIENT_RATE_MICROS;
  } else {
    const inboundRate = input.rateMicros ?? DEFAULT_INBOUND_RATE_MICROS;
    if (input.status === "completed") {
      call = billedMinutes(input.duration) * inboundRate;
      client = billedMinutes(input.duration) * CLIENT_RATE_MICROS;
    } else if (input.status === "voicemail") {
      // Greeting (~15s) + message.
      call = billedMinutes((input.recordingDuration ?? 0) + 15) * inboundRate;
    } else if (input.status === "missed") {
      // Caller listened to ringing / the greeting: at least one minute.
      call = inboundRate;
    }
  }
  return { call, client, recording: rec, total: call + client + rec };
}

/** "$0.0425" for small amounts, "$12.40" for larger ones. */
export function fmtUsd(micros: number | null | undefined, opts: { precise?: boolean } = {}): string {
  if (micros === null || micros === undefined) return "—";
  const usd = micros / MICROS;
  if (opts.precise || (usd > 0 && usd < 1)) {
    // Up to 4 decimals, trailing zeros trimmed, but never fewer than 2 ("$0.10", "$0.0425").
    let s = usd.toFixed(usd < 1 ? 4 : 3);
    while (s.endsWith("0") && s.split(".")[1].length > 2) s = s.slice(0, -1);
    return `$${s}`;
  }
  return `$${usd.toFixed(2)}`;
}

/** "$0.014/min" */
export function fmtRate(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return "—";
  return `${fmtUsd(micros, { precise: true })}/min`;
}
