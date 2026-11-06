// Pure call-status rules shared by every webhook. No DB / Twilio imports → unit-testable.
import type { CallStatus } from "@prisma/client";

export const FINAL_STATUSES: readonly CallStatus[] = [
  "completed",
  "no_answer",
  "busy",
  "failed",
  "canceled",
  "voicemail",
  "missed",
];

export function isFinal(s: CallStatus): boolean {
  return FINAL_STATUSES.includes(s);
}

const TRANSIENT_RANK: Record<string, number> = { initiated: 0, ringing: 1, in_progress: 2 };

/**
 * Twilio callbacks arrive out of order and sometimes twice. Decide whether `next` may replace
 * `current`:
 *  - transient statuses only ever move forward (initiated → ringing → in_progress);
 *  - any final status beats any transient one;
 *  - once final, only `missed → voicemail` is allowed (a voicemail recording arrived after the
 *    missed-call alert), so a late duplicate callback can never undo an outcome.
 */
export function canTransition(current: CallStatus, next: CallStatus): boolean {
  if (current === next) return false;
  if (isFinal(current)) return current === "missed" && next === "voicemail";
  if (isFinal(next)) return true;
  return (TRANSIENT_RANK[next] ?? 0) > (TRANSIENT_RANK[current] ?? 0);
}

/** Map a Twilio CallStatus / DialCallStatus string onto our enum. */
export function fromTwilioStatus(s: string | null | undefined): CallStatus | null {
  switch ((s ?? "").toLowerCase()) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "answered":
      return "in_progress";
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no_answer";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

/**
 * An outbound call whose dialed leg reported "completed" but never connected (0 seconds, never
 * answered) is really a no-answer — Twilio reports some unanswered international calls this way.
 */
export function normalizeOutboundFinal(status: CallStatus, durationSec: number, answered: boolean): CallStatus {
  if (status === "completed" && durationSec === 0 && !answered) return "no_answer";
  return status;
}

export const STATUS_LABEL: Record<CallStatus, string> = {
  initiated: "Dialing",
  ringing: "Ringing",
  in_progress: "In progress",
  completed: "Completed",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
  canceled: "Canceled",
  voicemail: "Voicemail",
  missed: "Missed",
};

/** Map well-known Twilio error codes to something a caller can act on. */
export function explainTwilioError(code: string | number | null | undefined): string | null {
  switch (String(code ?? "")) {
    case "13227":
    case "21215":
      return "This country isn't enabled for calling. Enable it in Twilio Console → Voice → Geo Permissions.";
    case "13224":
    case "21211":
    case "13223":
      return "That phone number isn't valid. Check the country code and digits.";
    case "13214":
    case "21210":
    case "21212":
      return "The caller ID isn't verified (or the Numero number lapsed). Check Twilio → Verified Caller IDs and Settings → Numbers.";
    case "20429":
    case "31206":
      return "Twilio concurrency limit reached. Ask Twilio support to raise it.";
    case "31201":
    case "31208":
    case "31401":
      return "Microphone access is blocked. Allow the microphone in the browser address bar.";
    case "31005":
    case "31009":
    case "53000":
      return "Lost connection to Twilio. Check your internet connection.";
    case "20101":
    case "20104":
    case "31204":
    case "31205":
      return "Calling session expired. Reload the page.";
    // Carrier SIP responses for calls that didn't connect (stored as "SIP <code>").
    case "SIP 404":
    case "SIP 484":
    case "SIP 410":
      return "The number doesn't exist or is disconnected.";
    case "SIP 403":
      return "The carrier rejected the call (check Geo Permissions; the caller ID may be blocked).";
    case "SIP 480":
    case "SIP 408":
      return "The phone was unreachable (switched off or out of coverage).";
    case "SIP 486":
    case "SIP 600":
      return "The line was busy.";
    case "SIP 603":
      return "The call was declined.";
    case "SIP 500":
    case "SIP 502":
    case "SIP 503":
      return "The carrier had a temporary problem. Try again later.";
    case "":
      return null;
    default:
      return null;
  }
}
