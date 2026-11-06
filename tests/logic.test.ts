import { describe, expect, it } from "vitest";
import { canTransition, explainTwilioError, fromTwilioStatus, isFinal, normalizeOutboundFinal } from "@/lib/call-status";
import { selectCallerId, type OwnedNumber } from "@/lib/caller-id";
import { countryOf, parsePhone, toE164 } from "@/lib/phone";

describe("call status transitions", () => {
  it("moves transient statuses forward only", () => {
    expect(canTransition("initiated", "ringing")).toBe(true);
    expect(canTransition("ringing", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "ringing")).toBe(false);
  });
  it("any final beats transient", () => {
    expect(canTransition("initiated", "failed")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });
  it("finals never get overwritten by late callbacks", () => {
    expect(canTransition("completed", "no_answer")).toBe(false);
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("voicemail", "missed")).toBe(false);
  });
  it("missed can become voicemail when the recording lands", () => {
    expect(canTransition("missed", "voicemail")).toBe(true);
  });
  it("maps Twilio statuses", () => {
    expect(fromTwilioStatus("no-answer")).toBe("no_answer");
    expect(fromTwilioStatus("in-progress")).toBe("in_progress");
    expect(fromTwilioStatus("queued")).toBe("initiated");
    expect(fromTwilioStatus("weird")).toBeNull();
    expect(isFinal("busy")).toBe(true);
  });
  it("treats a 0s never-answered 'completed' as no answer", () => {
    expect(normalizeOutboundFinal("completed", 0, false)).toBe("no_answer");
    expect(normalizeOutboundFinal("completed", 0, true)).toBe("completed");
    expect(normalizeOutboundFinal("completed", 42, false)).toBe("completed");
  });
  it("explains geo-permission errors", () => {
    expect(explainTwilioError("13227")).toMatch(/Geo Permissions/);
    expect(explainTwilioError(null)).toBeNull();
  });
});

describe("caller ID selection", () => {
  const owned: OwnedNumber[] = [
    { phoneNumber: "+14155550100", country: "US", isDefault: true, voiceEnabled: true },
    { phoneNumber: "+442071838750", country: "GB", isDefault: false, voiceEnabled: true },
    { phoneNumber: "+61291234567", country: "AU", isDefault: false, voiceEnabled: false },
  ];
  it("uses a local number for the destination country", () => {
    expect(selectCallerId("+442079460000", owned)).toBe("+442071838750");
  });
  it("falls back to a same-calling-code number (+1 Canada → US)", () => {
    expect(selectCallerId("+14165550123", owned)).toBe("+14155550100");
  });
  it("falls back to default when no local number", () => {
    expect(selectCallerId("+4930123456", owned)).toBe("+14155550100");
  });
  it("ignores voice-disabled numbers", () => {
    expect(selectCallerId("+61290000000", owned)).toBe("+14155550100");
  });
  it("honours an explicitly requested owned number", () => {
    expect(selectCallerId("+4930123456", owned, { requested: "+442071838750" })).toBe("+442071838750");
    expect(selectCallerId("+4930123456", owned, { requested: "+19999999999" })).toBe("+14155550100");
  });
  it("uses env default when the table is empty", () => {
    expect(selectCallerId("+4930123456", [], { envDefault: "+14155550199" })).toBe("+14155550199");
    expect(selectCallerId("+4930123456", [])).toBeNull();
  });
});

describe("phone parsing", () => {
  it("normalizes international formats", () => {
    expect(toE164("+44 20 7183 8750")).toBe("+442071838750");
    expect(toE164("0044 20 7183 8750")).toBe("+442071838750");
    expect(toE164("(415) 555-0100", "US")).toBe("+14155550100");
  });
  it("detects country", () => {
    expect(countryOf("+923001234567")).toBe("PK");
    expect(parsePhone("+61 2 9123 4567")?.country).toBe("AU");
  });
  it("assumes the US for numbers typed without a country code", () => {
    expect(toE164("(212) 555-0147")).toBe("+12125550147");
    expect(toE164("212-555-0147")).toBe("+12125550147");
    expect(toE164("+44 20 7183 8750")).toBe("+442071838750"); // explicit + still wins
  });
  it("explains carrier SIP responses", () => {
    expect(explainTwilioError("SIP 404")).toMatch(/doesn't exist/);
    expect(explainTwilioError("SIP 486")).toMatch(/busy/);
    expect(explainTwilioError("SIP 603")).toMatch(/declined/);
  });
  it("rejects garbage", () => {
    expect(parsePhone("12")).toBeNull();
    expect(parsePhone("")).toBeNull();
  });
});
