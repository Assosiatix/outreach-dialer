import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type ParsedPhone = { e164: string; country: string | null; national: string; international: string };

/** Country assumed for numbers typed without "+…" (the team targets the US). Inlined at build. */
export const DEFAULT_COUNTRY = (process.env.NEXT_PUBLIC_DEFAULT_COUNTRY || "US").toUpperCase();

/**
 * Parse anything a caller might type ("+44 20 7123 4567", "0044…", "(212) 555-0100" with a
 * default country) into E.164. Returns null when it isn't a plausible number.
 */
export function parsePhone(input: string, defaultCountry?: string | null): ParsedPhone | null {
  if (!input) return null;
  let raw = input.trim().replace(/[^\d+]/g, "");
  if (raw.startsWith("00")) raw = "+" + raw.slice(2);
  const p = parsePhoneNumberFromString(raw, ((defaultCountry || DEFAULT_COUNTRY).toUpperCase() as CountryCode) || undefined);
  if (!p || !p.isPossible()) return null;
  return {
    e164: p.number,
    country: p.country ?? null,
    national: p.formatNational(),
    international: p.formatInternational(),
  };
}

export function toE164(input: string, defaultCountry?: string | null): string | null {
  return parsePhone(input, defaultCountry)?.e164 ?? null;
}

export function countryOf(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

/** Calling code without "+", e.g. "44" for +44… */
export function callingCodeOf(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.countryCallingCode ?? null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("client:")) return e164.slice(7);
  const p = parsePhoneNumberFromString(e164);
  return p ? p.formatInternational() : e164;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function flag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
