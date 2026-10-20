import { describe, expect, it } from "vitest";
import { formatOpensAt, nextStatusCheckDelay } from "../src/opening.js";

const opensAt = "2026-10-31T01:00:00.000Z";

describe("formatOpensAt (仕様4-8・デザイン4-10)", () => {
  it("formats the opening time in Japan time for each language", () => {
    expect(formatOpensAt(opensAt, "ja")).toBe("10月31日（土）10:00");
    expect(formatOpensAt(opensAt, "en")).toBe("Sat, Oct 31, 10:00 (JST)");
  });
});

describe("nextStatusCheckDelay (仕様4-8)", () => {
  it("waits at most ten minutes, without jitter, while opening is far away", () => {
    expect(nextStatusCheckDelay({ opens_at: opensAt, server_time: "2026-10-30T01:00:00.000Z" }, () => 0.999)).toBe(600_000);
  });

  it("adds up to 30 seconds of jitter only to the final wait", () => {
    const status = { opens_at: opensAt, server_time: "2026-10-31T00:55:00.000Z" };
    expect(nextStatusCheckDelay(status, () => 0)).toBe(300_000);
    expect(nextStatusCheckDelay(status, () => 0.999)).toBe(329_970);
  });

  it("never returns a negative wait", () => {
    expect(nextStatusCheckDelay({ opens_at: opensAt, server_time: "2026-10-31T01:00:01.000Z" }, () => 0)).toBe(0);
  });
});
