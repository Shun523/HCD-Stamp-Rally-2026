import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_SECURITY_LIMITS, loadConfig } from "../src/config.js";

describe("server config", () => {
  it("resolves the default web build independently of the process cwd", () => {
    const config = loadConfig({});
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    expect(config.webDistDir).toBe(resolve(repositoryRoot, "web/dist"));
  });

  it("allows WEB_DIST_DIR to override the default", () => {
    expect(loadConfig({ WEB_DIST_DIR: "/tmp/custom-web" }).webDistDir).toBe("/tmp/custom-web");
  });

  it("accepts an optional database CA with escaped newlines", () => {
    expect(loadConfig({ DATABASE_SSL_CA: "certificate\\nsecond line" }).databaseSslCa)
      .toBe("certificate\nsecond line");
    expect(loadConfig({ DATABASE_SSL_CA: "" }).databaseSslCa).toBeUndefined();
  });

  it("uses the agreed limits and permits environment overrides", () => {
    expect(loadConfig({}).securityLimits).toEqual(DEFAULT_SECURITY_LIMITS);
    const config = loadConfig({ ADMIN_MAX_FAILURES: "5", SESSION_MAX_NEW_TOTAL: "50", SSE_MAX_CONNECTIONS_TOTAL: "100", MAX_REQUEST_BODY_BYTES: "4096" });
    expect(config.securityLimits).toMatchObject({ adminMaxFailures: 5, sessionMaxNewTotal: 50, sseMaxTotal: 100, maxRequestBodyBytes: 4_096 });
  });

  it("rejects settings that could silently disable protection", () => {
    for (const value of ["0", "-1", "1.5", "NaN", "Infinity", "", "9007199254740992"]) {
      expect(() => loadConfig({ ADMIN_MAX_FAILURES: value })).toThrow("ADMIN_MAX_FAILURES");
    }
  });

  it("trusts only the explicitly configured proxy hops outside Cloud Run", () => {
    expect(loadConfig({}).trustedProxyHops).toBe(0);
    expect(loadConfig({ K_SERVICE: "test-cloud-run-service" }).trustedProxyHops).toBe(1);
    expect(loadConfig({ K_SERVICE: "test-cloud-run-service", TRUSTED_PROXY_HOPS: "0" }).trustedProxyHops).toBe(0);
    expect(loadConfig({ TRUSTED_PROXY_HOPS: "2" }).trustedProxyHops).toBe(2);
  });
});
