import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export type DatabaseConnectionOptions = {
  /** Supabaseから取得したCA。指定時は証明書・ホスト名も検証する。 */
  ca?: string;
};

export function createDb(databaseUrl: string, options: DatabaseConnectionOptions = {}) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    // 接続文字列には認証情報が含まれるため、入力をエラーへ載せない。
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const requestedSsl = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl");
  // 仕様8章・11章: 外部DBはTLS必須。暗号化だけならrequire、CA指定時は証明書も検証する。
  // ローカルPostgreSQLの試験だけは、TLSを要求していなければ平文接続を許す。
  const ssl = options.ca
    ? { ca: options.ca, rejectUnauthorized: true }
    : requestedSsl === "verify-full" || requestedSsl === "verify-ca" || requestedSsl === "true"
      || url.searchParams.get("sslrootcert") === "system"
      ? true
      : isLoopback && (!requestedSsl || requestedSsl === "disable" || requestedSsl === "false")
        ? false : "require";
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    ssl,
  });
  return {
    db: drizzle(client, { schema }),
    client,
  };
}

export type AppDb = ReturnType<typeof createDb>["db"];
