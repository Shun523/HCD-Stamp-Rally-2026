import { describe, expect, it } from "vitest";
import { spots } from "../src/db/schema.js";

describe("database schema (仕様8章)", () => {
  // 単精度（real）では地図のピンが十数〜数十mずれるため、仕様どおり倍精度で持つ。
  it("stores spot coordinates in double precision", () => {
    expect(spots.lat.getSQLType()).toBe("double precision");
    expect(spots.lng.getSQLType()).toBe("double precision");
  });
});
