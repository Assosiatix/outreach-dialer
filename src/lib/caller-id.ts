// Local-presence caller ID: pick the "From" number by destination country (Phase 3).
// Pure function so it can be unit-tested; the DB lookup lives in twilio-numbers.ts.
import { callingCodeOf, countryOf } from "./phone";

export type OwnedNumber = {
  phoneNumber: string;
  country: string;
  isDefault: boolean;
  voiceEnabled: boolean;
};

/**
 * 1. An explicitly requested number, if we own it and it's voice-enabled.
 * 2. A number in the same country as the destination.
 * 3. A number sharing the destination's calling code (e.g. +1 US number for a Canadian call).
 * 4. The default number, then the env fallback, then any voice number.
 */
export function selectCallerId(
  destinationE164: string,
  owned: OwnedNumber[],
  opts: { requested?: string | null; envDefault?: string | null } = {},
): string | null {
  const voice = owned.filter((n) => n.voiceEnabled);
  if (opts.requested) {
    const hit = voice.find((n) => n.phoneNumber === opts.requested);
    if (hit) return hit.phoneNumber;
  }
  const destCountry = countryOf(destinationE164);
  if (destCountry) {
    const local = voice.filter((n) => n.country === destCountry);
    if (local.length) return (local.find((n) => n.isDefault) ?? local[0]).phoneNumber;
  }
  const destCode = callingCodeOf(destinationE164);
  if (destCode) {
    const sameCode = voice.find((n) => callingCodeOf(n.phoneNumber) === destCode);
    if (sameCode) return sameCode.phoneNumber;
  }
  const def = voice.find((n) => n.isDefault);
  if (def) return def.phoneNumber;
  if (opts.envDefault) return opts.envDefault;
  return voice[0]?.phoneNumber ?? null;
}
