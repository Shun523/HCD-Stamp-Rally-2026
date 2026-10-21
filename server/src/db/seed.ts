import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "./client.js";
import { spots, devices } from "./schema.js";
import { loadConfig } from "../config.js";

// 仕様4-6: スポットの地図上の位置（spot-01から順）。2026-10-21に利用者から受け取った地点。
const spotLocations = [
  { lat: 34.6865463, lng: 133.9217822 },
  { lat: 34.6859605, lng: 133.9216712 },
  { lat: 34.6867095, lng: 133.9188354 },
  { lat: 34.6870875, lng: 133.9188562 },
  { lat: 34.6872645, lng: 133.9208125 },
];

// 仕様4-6: 確定データが届くまでのサンプルスポット。文言・画像は差し替える。
export const sampleSpots = spotLocations.map(({ lat, lng }, index) => {
  const number = index + 1;
  return {
    id: `spot-${String(number).padStart(2, "0")}`,
    nameJa: `スポット${number}（サンプル）`,
    nameEn: `Spot ${number} (Sample)`,
    displayOrder: number,
    lat,
    lng,
    descriptionJa: `スポット${number}の案内（サンプル）`,
    descriptionEn: `Guide for spot ${number} (sample)`,
    locationNoteJa: null,
    locationNoteEn: null,
    isSample: true,
  };
});

const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");

const main = async () => {
  const config = loadConfig();
  const { db, client } = createDb(config.databaseUrl, { ca: config.databaseSslCa });
  try {
    await db.insert(spots).values(sampleSpots).onConflictDoUpdate({
      target: spots.id,
      set: {
        nameJa: sql`excluded.name_ja`,
        nameEn: sql`excluded.name_en`,
        displayOrder: sql`excluded.display_order`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        descriptionJa: sql`excluded.description_ja`,
        descriptionEn: sql`excluded.description_en`,
        locationNoteJa: sql`excluded.location_note_ja`,
        locationNoteEn: sql`excluded.location_note_en`,
        isSample: sql`excluded.is_sample`,
      },
    });

    const configuredKeys = process.env.DEVICE_KEYS_JSON
      ? JSON.parse(process.env.DEVICE_KEYS_JSON) as Record<string, string>
      : {};
    const deviceEntries = Object.entries(configuredKeys).map(([id, key], index) => ({
      id,
      apiKeyHash: keyHash(key),
      spotId: sampleSpots[index % sampleSpots.length]?.id ?? null,
      status: "断",
    }));
    if (deviceEntries.length > 0) {
      await db.insert(devices).values(deviceEntries).onConflictDoUpdate({
        target: devices.id,
        set: {
          apiKeyHash: sql`excluded.api_key_hash`,
          spotId: sql`excluded.spot_id`,
        },
      });
    }
    if (deviceEntries.length === 0) {
      console.log("seeded spots; no device keys supplied");
    } else {
      console.log(`seeded ${sampleSpots.length} spots and ${deviceEntries.length} devices`);
    }
  } finally {
    await client.end();
  }
};

await main();
