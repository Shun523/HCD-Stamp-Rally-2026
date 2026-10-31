import { describe, expect, it } from "vitest";
import { adminStatsResponseSchema, meResponseSchema, stampRequestSchema, statusResponseSchema } from "../src/index.js";

describe("shared API contracts", () => {
  it("accepts the server's participant response", () => {
    const result = meResponseSchema.safeParse({
      token: "token",
      token_expires_at: "2026-10-31T07:00:00.000Z",
      stamps: [],
      completed: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stamp request without a device id", () => {
    expect(stampRequestSchema.safeParse({ token: "token" }).success).toBe(false);
  });

  it("requires the admin stats sample-data signal", () => {
    expect(adminStatsResponseSchema.safeParse({
      participant_count: 1,
      stamp_count_by_spot: [],
      completed_count: 0,
      sample_spots_active: true,
    }).success).toBe(true);
    expect(adminStatsResponseSchema.safeParse({
      participant_count: 1,
      stamp_count_by_spot: [],
      completed_count: 0,
    }).success).toBe(false);
  });

  it("accepts the participant opening status with the server time", () => {
    expect(statusResponseSchema.safeParse({
      open: false,
      ended: false,
      opens_at: "2026-10-31T01:00:00.000Z",
      server_time: "2026-10-30T09:00:00.000Z",
    }).success).toBe(true);
    expect(statusResponseSchema.safeParse({ open: false, ended: false, opens_at: "2026-10-31T01:00:00.000Z" }).success).toBe(false);
    // 仕様4-8: 終了の判定もサーバーが返す。
    expect(statusResponseSchema.safeParse({
      open: false,
      opens_at: "2026-10-31T01:00:00.000Z",
      server_time: "2026-10-30T09:00:00.000Z",
    }).success).toBe(false);
  });
});
