import "server-only";
// Uses the full ("max") metadata, which knows number *types* — kept server-side so the browser
// bundle stays on the small default metadata.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Numbers that are expensive by nature even when Twilio can't quote a rate: premium-rate and
 * shared-cost lines (e.g. US 900) and non-geographic international networks such as satellite
 * phones (+881, +882, +883, +870), which can cost several dollars a minute.
 */
export function riskyDestination(e164: string): string | null {
  const p = parsePhoneNumberFromString(e164);
  if (!p) return null;
  if (["881", "882", "883", "870", "979", "808"].includes(p.countryCallingCode)) return "satellite / international network number";
  const type = p.getType();
  if (type === "PREMIUM_RATE") return "premium-rate number";
  if (type === "SHARED_COST") return "shared-cost number";
  return null;
}
