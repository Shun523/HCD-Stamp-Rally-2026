import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import type { AppDb } from "../../src/db/client.js";

// 仕様8章: 本番と同じdrizzleのマイグレータを使う。結合テストのファイルは並行に動くため、
// 空のDBへ同時に流して片方が未作成の表を参照しないよう、アドバイザリーロックで順番に流す。
export async function migrateTestDatabase(sql: Sql, db: AppDb): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('hcd-stamp-rally-test-migrate'))`;
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  });
}
