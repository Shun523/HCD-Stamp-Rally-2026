import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";

describe("database transport security (仕様8章・11章)", () => {
  it("requires TLS for an external database even when the URL requests plaintext", async () => {
    for (const suffix of ["", "?sslmode=disable", "?ssl=false", "?sslmode=prefer"]) {
      const { client } = createDb(`postgresql://test:test@db.example.invalid:5432/test${suffix}`);
      try {
        expect(client.options.ssl).toBe("require");
      } finally {
        await client.end();
      }
    }
  });

  it("allows the local PostgreSQL used by tests without TLS", async () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const { client } = createDb(`postgresql://test:test@${host}:54322/test`);
      try {
        expect(client.options.ssl).toBe(false);
      } finally {
        await client.end();
      }
    }
  });

  it("does not downgrade an explicitly requested certificate verification", async () => {
    const { client } = createDb("postgresql://test:test@db.example.invalid/test?sslmode=verify-full");
    try {
      expect(client.options.ssl).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("verifies the certificate when a trusted CA is configured", async () => {
    const ca = "test CA supplied by the environment";
    const { client } = createDb("postgresql://test:test@db.example.invalid/test?sslmode=disable", { ca });
    try {
      expect(client.options.ssl).toEqual({ ca, rejectUnauthorized: true });
    } finally {
      await client.end();
    }
  });
});
