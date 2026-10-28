import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { fetchExportRows } from "../src/db/event-report.js";
import { PostgresRepository } from "../src/db/repository.js";
import { devices, spots } from "../src/db/schema.js";
import { hashSecret } from "../src/security.js";
import { migrateTestDatabase } from "./support/migrate-test-database.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("event data export from PostgreSQL (仕様11章)", () => {
  it("reads every table needed for the export without device key hashes", async () => {
    const sql = postgres(databaseUrl!, { prepare: false });
    const { db, client } = createDb(databaseUrl!);
    const suffix = randomUUID().slice(0, 8);
    const sessionId = `export-session-${suffix}`;
    const deviceId = `export-device-${suffix}`;
    const spotId = `export-spot-${suffix}`;
    try {
      await migrateTestDatabase(sql, db);
      await db.insert(spots).values({ id: spotId, nameJa: "書き出し試験", nameEn: "Export test", displayOrder: 99, lat: 34.66, lng: 133.91, descriptionJa: "", descriptionEn: "" });
      await db.insert(devices).values({ id: deviceId, apiKeyHash: hashSecret("export-key"), spotId, status: "正常" });
      const repository = new PostgresRepository(db);
      const createdAt = new Date("2026-10-31T01:05:00.000Z");
      await repository.createSession({ id: sessionId, token: `export-token-${suffix}`, userAgent: "export-test", createdAt, issuedAt: createdAt });
      const stamped = await repository.createStamp({ token: `export-token-${suffix}`, deviceId, eventId: `evt_export_${suffix}`, stampedAt: new Date("2026-10-31T01:10:00.000Z"), deviceStampedAt: new Date("2026-10-31T01:10:00.000Z") });
      await repository.ackEvent(stamped!.eventId!, sessionId);

      const rows = await fetchExportRows(db);
      expect(rows.spots).toContainEqual({ id: spotId, nameJa: "書き出し試験", displayOrder: 99 });
      expect(rows.sessions).toContainEqual({ id: sessionId, createdAt, userAgent: "export-test" });
      expect(rows.stamps.find((stamp) => stamp.sessionId === sessionId)).toMatchObject({ spotId, deviceId, visitOrder: 1 });
      expect(rows.deliveries.find((delivery) => delivery.sessionId === sessionId)).toMatchObject({ result: "acked" });
      const device = rows.devices.find((row) => row.id === deviceId);
      expect(device).toEqual({ id: deviceId, spotId, lastHeartbeatAt: null, status: "正常" });
      expect(device).not.toHaveProperty("apiKeyHash");
    } finally {
      await sql.unsafe(`delete from sessions where id = '${sessionId}'`);
      await sql.unsafe(`delete from devices where id = '${deviceId}'`);
      await sql.unsafe(`delete from spots where id = '${spotId}'`);
      await client.end();
      await sql.end();
    }
  });
});
