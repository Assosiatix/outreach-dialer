import { describe, expect, it } from "vitest";
import { billedMinutes, estimateCost, fmtRate, fmtUsd, toMicros } from "@/lib/cost-math";

describe("cost math", () => {
  it("parses Twilio's negative price strings", () => {
    expect(toMicros("-0.18000")).toBe(180_000);
    expect(toMicros("-0.00400")).toBe(4_000);
    expect(toMicros(null)).toBeNull();
    expect(toMicros("")).toBeNull();
  });

  it("rounds every started minute up", () => {
    expect(billedMinutes(0)).toBe(0);
    expect(billedMinutes(8)).toBe(1);
    expect(billedMinutes(60)).toBe(1);
    expect(billedMinutes(61)).toBe(2);
    expect(billedMinutes(125)).toBe(3);
  });

  it("estimates a 2-minute US outbound call with recording", () => {
    const c = estimateCost({ direction: "outbound", status: "completed", duration: 120, recordingDuration: 120, rateMicros: 14_000 });
    expect(c).toEqual({ call: 28_000, client: 8_000, recording: 5_000, total: 41_000 }); // $0.041
  });

  it("matches the real Pakistan test call ($0.18 + $0.004 + $0.0025)", () => {
    const c = estimateCost({ direction: "outbound", status: "completed", duration: 23, recordingDuration: 23, rateMicros: 180_000 });
    expect(c.total).toBe(186_500);
  });

  it("charges nothing for unanswered outbound calls", () => {
    for (const status of ["no_answer", "busy", "failed", "canceled"]) {
      expect(estimateCost({ direction: "outbound", status, duration: 0, recordingDuration: null, rateMicros: 14_000 }).total).toBe(0);
    }
  });

  it("estimates inbound voicemail on the inbound leg", () => {
    const c = estimateCost({ direction: "inbound", status: "voicemail", duration: 0, recordingDuration: 50, rateMicros: 8_500 });
    expect(c.call).toBe(8_500 * 2); // 50s message + 15s greeting = 2 billed min
    expect(c.recording).toBe(2_500);
    expect(c.client).toBe(0);
  });

  it("formats USD", () => {
    expect(fmtUsd(41_000)).toBe("$0.041");
    expect(fmtUsd(186_500)).toBe("$0.1865");
    expect(fmtUsd(100_000)).toBe("$0.10");
    expect(fmtUsd(4_100_000)).toBe("$4.10");
    expect(fmtUsd(0)).toBe("$0.00");
    expect(fmtUsd(null)).toBe("—");
    expect(fmtRate(14_000)).toBe("$0.014/min");
  });
});
