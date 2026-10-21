import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { PostgresRepository } from "../src/db/repository.js";
import { devices, spots } from "../src/db/schema.js";
import { hashSecret } from "../src/security.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("PostgreSQL persistence", () => {
  it("runs the migration and keeps a stamp after repository recreation", async () => {
    const sql = postgres(databaseUrl!, { prepare: false });
    const { db, client } = createDb(databaseUrl!);
    const recreatedDb = createDb(databaseUrl!);
    const suffix = randomUUID().slice(0, 8);
    const sessionId = `integration-session-${suffix}`;
    const token = `integration-token-${suffix}`;
    const deviceId = `integration-device-${suffix}`;
    const spotId = `integration-spot-${suffix}`;
    try {
      // 仕様8章: 本番と同じdrizzleのマイグレータを使い、適用済みのDBでも再実行できるようにする。
      await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
      await db.insert(spots).values({
        id: spotId,
        nameJa: "統合テスト",
        nameEn: "Integration test",
        displayOrder: 1,
        lat: 34.66,
        lng: 133.91,
        descriptionJa: "",
        descriptionEn: "",
        locationNoteJa: null,
        locationNoteEn: null,
      });
      await db.insert(devices).values({
        id: deviceId,
        apiKeyHash: hashSecret("integration-key"),
        spotId,
        status: "正常",
      });
      const repository = new PostgresRepository(db);
      const issuedAt = new Date("2026-10-31T04:00:00.000Z");
      await repository.createSession({
        id: sessionId,
        token,
        userAgent: "integration-test",
        createdAt: issuedAt,
        issuedAt,
      });
      const first = await repository.createStamp({
        token,
        deviceId,
        eventId: `evt_${suffix}`,
        stampedAt: new Date("2026-10-31T04:24:05.000Z"),
        deviceStampedAt: new Date("2026-10-31T04:24:05.000Z"),
      });
      const second = await repository.createStamp({
        token,
        deviceId,
        eventId: `evt_duplicate_${suffix}`,
        stampedAt: new Date("2026-10-31T04:30:00.000Z"),
        deviceStampedAt: null,
      });
      expect(first?.result).toBe("stamped");
      expect(second?.result).toBe("already");

      const recreated = new PostgresRepository(recreatedDb.db);
      const persisted = await recreated.getStampsForSession(sessionId);
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.stampedAt.toISOString()).toBe("2026-10-31T04:24:05.000Z");

      // 仕様4-6・8章: 地図のピンがずれないよう、座標は丸めずに読み出せること。
      await db.update(spots).set({ lat: 34.6865463, lng: 133.9217822 }).where(eq(spots.id, spotId));
      const storedSpot = (await recreated.getSpots()).find((spot) => spot.id === spotId);
      expect(storedSpot).toMatchObject({ lat: 34.6865463, lng: 133.9217822 });
    } finally {
      await sql.unsafe(`delete from sessions where id = '${sessionId}'`);
      await sql.unsafe(`delete from devices where id = '${deviceId}'`);
      await sql.unsafe(`delete from spots where id = '${spotId}'`);
      await recreatedDb.client.end();
      await client.end();
      await sql.end();
    }
  });
});
