import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
      const migration = await readFile(new URL("../drizzle/0000_jazzy_vision.sql", import.meta.url), "utf8");
      await sql.unsafe(migration);
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
