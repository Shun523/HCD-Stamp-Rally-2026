import { randomUUID } from "node:crypto";
import { eq, TransactionRollbackError } from "drizzle-orm";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createDb, type AppDb } from "../src/db/client.js";
import { PostgresRepository } from "../src/db/repository.js";
import { devices, sessions, spots, stamps } from "../src/db/schema.js";
import { hashSecret } from "../src/security.js";
import { migrateTestDatabase } from "./support/migrate-test-database.js";

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
      await migrateTestDatabase(sql, db);
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

  // 仕様7章・4-8: 開放前に発行したセッションは試験用なので、その押印も含めて参加状況に数えない。
  it("leaves sessions issued before opening out of the dashboard stats", async () => {
    const sql = postgres(databaseUrl!, { prepare: false });
    const { db, client } = createDb(databaseUrl!);
    const suffix = randomUUID().slice(0, 8);
    const openAt = new Date("2099-01-01T00:00:00.000Z");
    const testSession = `stats-test-${suffix}`;
    const completeSession = `stats-complete-${suffix}`;
    const partialSession = `stats-partial-${suffix}`;
    const firstSpot = `stats-spot-1-${suffix}`;
    const secondSpot = `stats-spot-2-${suffix}`;
    try {
      await migrateTestDatabase(sql, db);
      // 並行する結合テストが足すスポットで完走の判定が揺れないよう、1つのスナップショットで数え、最後に取り消す。
      await db.transaction(async (tx) => {
        await tx.insert(spots).values([firstSpot, secondSpot].map((id, index) => ({
          id,
          nameJa: "集計テスト",
          nameEn: "Stats test",
          displayOrder: 100 + index,
          lat: 34.66,
          lng: 133.91,
          descriptionJa: "",
          descriptionEn: "",
          locationNoteJa: null,
          locationNoteEn: null,
        })));
        await tx.insert(sessions).values([
          { id: testSession, createdAt: new Date("2098-12-31T23:59:59.000Z"), userAgent: "integration-test" },
          { id: completeSession, createdAt: openAt, userAgent: "integration-test" },
          { id: partialSession, createdAt: new Date("2099-01-01T01:00:00.000Z"), userAgent: "integration-test" },
        ]);
        const allSpots = await tx.select({ id: spots.id }).from(spots);
        const stampRow = (sessionId: string, spotId: string, visitOrder: number) => ({
          sessionId,
          spotId,
          visitOrder,
          stampedAt: new Date("2099-01-01T02:00:00.000Z"),
          deviceStampedAt: null,
          deviceId: `stats-device-${suffix}`,
        });
        await tx.insert(stamps).values([
          ...allSpots.map((spot, index) => stampRow(testSession, spot.id, index + 1)),
          ...allSpots.map((spot, index) => stampRow(completeSession, spot.id, index + 1)),
          stampRow(partialSession, firstSpot, 1),
        ]);
        const stats = await new PostgresRepository(tx as unknown as AppDb).getStats(openAt);
        expect(stats.participantCount).toBe(2);
        expect(stats.completedCount).toBe(1);
        expect(stats.stampCountBySpot.find((row) => row.spotId === firstSpot)?.count).toBe(2);
        expect(stats.stampCountBySpot.find((row) => row.spotId === secondSpot)?.count).toBe(1);
        tx.rollback();
      }, { isolationLevel: "repeatable read" }).catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
    } finally {
      await client.end();
      await sql.end();
    }
  });
});
