import { describe, expect, it } from "vitest";
import { spotData } from "../src/db/spot-data.js";

describe("spot data (仕様4-6)", () => {
  // スポットIDは機体の設定とスタンプ画像のファイル名に結び付くため、spot-01〜spot-05で固定する。
  it("defines spot-01 to spot-05 in order", () => {
    expect(spotData.map((spot) => spot.id)).toEqual(["spot-01", "spot-02", "spot-03", "spot-04", "spot-05"]);
  });

  it("uses each display order once", () => {
    expect(spotData.map((spot) => spot.displayOrder).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("fills the required names and descriptions in both languages", () => {
    for (const spot of spotData) {
      expect(spot.nameJa.trim()).not.toBe("");
      expect(spot.nameEn.trim()).not.toBe("");
      expect(spot.descriptionJa.trim()).not.toBe("");
      expect(spot.descriptionEn.trim()).not.toBe("");
    }
  });
});
