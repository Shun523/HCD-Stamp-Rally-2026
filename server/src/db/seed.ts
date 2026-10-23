import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "./client.js";
import { spots, devices } from "./schema.js";
import { spotData } from "./spot-data.js";
import { loadConfig } from "../config.js";

const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");

const main = async () => {
  const config = loadConfig();
  const { db, client } = createDb(config.databaseUrl, { ca: config.databaseSslCa });
  try {
    await db.insert(spots).values(spotData).onConflictDoUpdate({
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
      spotId: spotData[index % spotData.length]?.id ?? null,
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
      console.log(`seeded ${spotData.length} spots and ${deviceEntries.length} devices`);
    }
  } finally {
    await client.end();
  }
};

await main();
