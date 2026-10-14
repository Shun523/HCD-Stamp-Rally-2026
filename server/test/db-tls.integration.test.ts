import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const caFile = process.env.TEST_DATABASE_SSL_CA_FILE;
const integration = databaseUrl && caFile ? describe : describe.skip;

integration("local PostgreSQL TLS (仕様8章・11章)", () => {
  let ca = "";

  beforeAll(async () => {
    // この試験は本番Supabase等を使わず、証明書付きのローカルDBだけに接続する。
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(databaseUrl!).hostname);
    ca = await readFile(caFile!, "utf8");
  });

  it("actually encrypts a connection when TLS is required", async () => {
    const url = new URL(databaseUrl!);
    url.searchParams.set("sslmode", "require");
    const { client } = createDb(url.toString());
    try {
      const rows = await client`select ssl from pg_stat_ssl where pid = pg_backend_pid()`;
      expect(rows[0]?.ssl).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("connects with a trusted CA and keeps TLS enabled", async () => {
    const { client } = createDb(databaseUrl!, { ca });
    try {
      const rows = await client`select ssl from pg_stat_ssl where pid = pg_backend_pid()`;
      expect(rows[0]?.ssl).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("rejects an untrusted certificate without falling back to an unverified connection", async () => {
    const { client } = createDb(databaseUrl!, { ca: "invalid CA certificate" });
    try {
      await expect(client`select 1`).rejects.toBeDefined();
    } finally {
      await client.end();
    }
  });
});
