import { describe, expect, it } from "vitest";
import { FixedWindowLimiter } from "../src/rate-limit.js";

describe("fixed-window abuse protection", () => {
  it("allows the budget, rejects further requests, and recovers after the window", () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(2, 10_000, 10, () => now);
    expect(limiter.take("client-a")).toBe(0);
    expect(limiter.take("client-a")).toBe(0);
    expect(limiter.take("client-a")).toBe(10);
    now = 9_001;
    expect(limiter.retryAfter("client-a")).toBe(1);
    now = 10_000;
    expect(limiter.take("client-a")).toBe(0);
  });

  it("keeps independent clients separate and can clear failures after a successful login", () => {
    const limiter = new FixedWindowLimiter(1, 60_000, 10, () => 0);
    expect(limiter.take("client-a")).toBe(0);
    expect(limiter.take("client-a")).toBe(60);
    expect(limiter.take("client-b")).toBe(0);
    limiter.reset("client-a");
    expect(limiter.take("client-a")).toBe(0);
    expect(limiter.take("client-b")).toBe(60);
  });

  it("bounds memory without evicting a blocked client and expires old client keys", () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(1, 5_000, 2, () => now);
    expect(limiter.take("client-a")).toBe(0);
    expect(limiter.take("client-b")).toBe(0);
    expect(limiter.take("client-c")).toBe(5);
    expect(limiter.take("client-a")).toBe(5);
    now = 5_000;
    expect(limiter.take("client-c")).toBe(0);
  });
});
