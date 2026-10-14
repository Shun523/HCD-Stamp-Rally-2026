import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DEFAULT_SECURITY_LIMITS, type SecurityLimits } from "../src/config.js";
import { SseHub } from "../src/sse.js";
import { MemoryRepository } from "./support/memory-repository.js";

const envFor = (address = "192.0.2.1") => ({ incoming: { socket: { remoteAddress: address } } });
const cookieFrom = (response: Response) => response.headers.get("set-cookie")!.split(";", 1)[0]!;

function setup(overrides: Partial<SecurityLimits> = {}, trustedProxyHops = 0) {
  const repository = new MemoryRepository();
  const hub = new SseHub();
  const clock = { value: 0 };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const app = createApp({
    repository,
    hub,
    logger,
    now: () => new Date("2026-10-31T12:00:00+09:00"),
    monotonicNow: () => clock.value,
    config: {
      adminPassword: "test-staff-password",
      ackTimeoutMs: 1,
      trustedProxyHops,
      securityLimits: { ...DEFAULT_SECURITY_LIMITS, ...overrides },
    },
  });
  return { app, repository, hub, clock, logger };
}

describe("security limits on public routes (仕様5章・7章・11章)", () => {
  it("blocks further password guesses after 20 failures across both admin APIs and recovers after ten minutes", async () => {
    const { app, clock, logger, repository } = setup();
    const stats = vi.spyOn(repository, "getStats");
    for (let index = 0; index < 20; index++) {
      const path = index % 2 ? "/api/admin/devices" : "/api/admin/stats";
      const response = await app.request(path, { headers: { "x-admin-password": "wrong-password" } }, envFor());
      expect(response.status).toBe(401);
    }
    const blocked = await app.request("/api/admin/stats", { headers: { "x-admin-password": "test-staff-password" } }, envFor());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");
    expect(stats).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("wrong-password");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("192.0.2.1");
    const otherSource = await app.request("/api/admin/stats", { headers: { "x-admin-password": "test-staff-password" } }, envFor("192.0.2.2"));
    expect(otherSource.status).toBe(200);
    clock.value = 10 * 60_000;
    expect((await app.request("/api/admin/stats", { headers: { "x-admin-password": "test-staff-password" } }, envFor())).status).toBe(200);
  });

  it("clears earlier failures after a successful login and does not count normal dashboard polling", async () => {
    const { app } = setup({ adminMaxFailures: 2 });
    const request = (password: string) => app.request("/api/admin/stats", { headers: { "x-admin-password": password } }, envFor());
    expect((await request("wrong")).status).toBe(401);
    for (let index = 0; index < 25; index++) expect((await request("test-staff-password")).status).toBe(200);
    expect((await request("wrong")).status).toBe(401);
    expect((await request("wrong")).status).toBe(401);
    expect((await request("wrong")).status).toBe(429);
  });

  it("limits new sessions per source without letting a forged forwarding header bypass the limit", async () => {
    const { app, repository, clock } = setup({ sessionMaxNewPerSource: 2 });
    const first = await app.request("/", {}, envFor());
    expect(first.status).toBe(302);
    expect((await app.request("/", {}, envFor())).status).toBe(302);
    const blocked = await app.request("/", { headers: { "x-forwarded-for": "198.51.100.99" } }, envFor());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    expect(blocked.headers.has("set-cookie")).toBe(false);
    expect(await blocked.text()).toContain("もう一度QRコードを読み込んでください。");
    expect(repository.sessions.size).toBe(2);
    expect((await app.request("/", { headers: { cookie: cookieFrom(first) } }, envFor())).status).toBe(200);
    expect((await app.request("/", {}, envFor("192.0.2.2"))).status).toBe(302);
    clock.value = 60_000;
    expect((await app.request("/", {}, envFor())).status).toBe(302);
  });

  it("keeps the same trusted source limited when the spoofable prefix changes", async () => {
    const { app } = setup({ sessionMaxNewPerSource: 1 }, 1);
    const source = envFor("169.254.1.1");
    expect((await app.request("/", { headers: { "x-forwarded-for": "198.51.100.1, 192.0.2.1" } }, source)).status).toBe(302);
    expect((await app.request("/", { headers: { "x-forwarded-for": "198.51.100.2, 192.0.2.1" } }, source)).status).toBe(429);
    expect((await app.request("/", { headers: { "x-forwarded-for": "198.51.100.2, 192.0.2.2" } }, source)).status).toBe(302);
  });

  it("applies a global creation budget across sources and recovers after its window", async () => {
    const { app, repository, clock } = setup({ sessionMaxNewTotal: 2 });
    expect((await app.request("/", {}, envFor("192.0.2.1"))).status).toBe(302);
    expect((await app.request("/", {}, envFor("192.0.2.2"))).status).toBe(302);
    expect((await app.request("/", {}, envFor("192.0.2.3"))).status).toBe(429);
    expect(repository.sessions.size).toBe(2);
    clock.value = 60_000;
    expect((await app.request("/", {}, envFor("192.0.2.3"))).status).toBe(302);
  });

  it("reserves the creation budget atomically under concurrent requests", async () => {
    const { app, repository } = setup({ sessionMaxNewTotal: 5 });
    const responses = await Promise.all(Array.from({ length: 30 }, () => app.request("/", {}, envFor())));
    expect(responses.filter((response) => response.status === 302)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(25);
    expect(repository.sessions.size).toBe(5);
  });

  it("allows the expected 100 participants behind a shared campus address", async () => {
    const { app, repository } = setup();
    const responses = await Promise.all(Array.from({ length: 100 }, () => app.request("/", {}, envFor())));
    expect(responses.every((response) => response.status === 302)).toBe(true);
    expect(repository.sessions.size).toBe(100);
  });

  it("allows six notification tabs, rejects a seventh, and releases a cancelled connection", async () => {
    const { app, hub } = setup();
    const cookie = cookieFrom(await app.request("/"));
    const sessionId = cookie.split("=")[1]!;
    const streams: Response[] = [];
    try {
      for (let index = 0; index < 6; index++) {
        const response = await app.request("/api/events", { headers: { cookie } });
        expect(response.status).toBe(200);
        streams.push(response);
      }
      expect(hub.connectionCount(sessionId)).toBe(6);
      const blocked = await app.request("/api/events", { headers: { cookie } });
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: "too_many_connections" });
      await streams[0]!.body!.cancel();
      const replacement = await app.request("/api/events", { headers: { cookie } });
      expect(replacement.status).toBe(200);
      streams.push(replacement);
      expect(hub.connectionCount(sessionId)).toBe(6);
    } finally {
      await Promise.all(streams.map((response) => response.body?.cancel()));
    }
    expect(hub.connectionCount(sessionId)).toBe(0);
  });

  it("releases notification capacity on an aborted request and rejects invalid sessions first", async () => {
    const { app, hub } = setup({ sseMaxTotal: 1 });
    const cookie = cookieFrom(await app.request("/"));
    const sessionId = cookie.split("=")[1]!;
    const abort = new AbortController();
    const first = await app.request("/api/events", { headers: { cookie }, signal: abort.signal });
    let next: Response | undefined;
    try {
      expect((await app.request("/api/events", { headers: { cookie: "hcd_session=invalid" } })).status).toBe(401);
      expect((await app.request("/api/events", { headers: { cookie } })).status).toBe(429);
      abort.abort();
      next = await app.request("/api/events", { headers: { cookie } });
      expect(next.status).toBe(200);
      expect(hub.connectionCount(sessionId)).toBe(1);
    } finally {
      await first.body?.cancel();
      await next?.body?.cancel();
    }
    expect(hub.connectionCount(sessionId)).toBe(0);
  });

  it("enforces the default global 1200-connection budget across different sessions", async () => {
    const { app, repository } = setup();
    for (let index = 0; index <= 200; index++) {
      await repository.createSession({ id: `sse-${index}`, token: `token-${index}`, userAgent: "test", createdAt: new Date(), issuedAt: new Date() });
    }
    const streams = await Promise.all(Array.from({ length: 1_201 }, (_, index) =>
      app.request("/api/events", { headers: { cookie: `hcd_session=sse-${Math.floor(index / 6)}` } })));
    try {
      expect(streams.filter((response) => response.status === 200)).toHaveLength(1_200);
      expect(streams.filter((response) => response.status === 429)).toHaveLength(1);
    } finally {
      await Promise.all(streams.map((response) => response.body?.cancel()));
    }
    const restored = await app.request("/api/events", { headers: { cookie: "hcd_session=sse-200" } });
    expect(restored.status).toBe(200);
    await restored.body!.cancel();
  }, 15_000);

  it("accepts an 8KiB JSON body and rejects larger bodies before device authentication", async () => {
    const { app, repository } = setup();
    const getDevice = vi.spyOn(repository, "getDevice");
    const empty = JSON.stringify({ token: "token", device_id: "dev-01", padding: "" });
    const body = JSON.stringify({ token: "token", device_id: "dev-01", padding: "a".repeat(8_192 - empty.length) });
    expect(new TextEncoder().encode(body).length).toBe(8_192);
    expect((await app.request("/api/stamp", { method: "POST", body, headers: { "content-type": "application/json" } })).status).toBe(401);
    for (const headers of [
      { "content-type": "application/json" },
      { "content-type": "application/json", "content-length": "8193", authorization: "Bearer device-key" },
    ]) {
      const response = await app.request("/api/stamp", { method: "POST", body: body + " ", headers });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "payload_too_large" });
    }
    expect(getDevice).not.toHaveBeenCalled();
  });

  it("counts actual bytes for streamed bodies without Content-Length", async () => {
    const { app } = setup();
    const bytes = new TextEncoder().encode(JSON.stringify({ token: "token", device_id: "dev-01", padding: "あ".repeat(3_000) }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 5_000));
        controller.enqueue(bytes.slice(5_000));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/stamp", { method: "POST", body, duplex: "half" } as RequestInit);
    expect((await app.request(request)).status).toBe(413);
  });

  it("rejects overlong request identifiers without querying device credentials", async () => {
    const { app, repository } = setup();
    const getDevice = vi.spyOn(repository, "getDevice");
    for (const value of [
      { token: "a".repeat(65), device_id: "dev-01" },
      { token: "token", device_id: "a".repeat(65) },
    ]) {
      const response = await app.request("/api/stamp", { method: "POST", headers: { authorization: "Bearer device-key", "content-type": "application/json" }, body: JSON.stringify(value) });
      expect(response.status).toBe(400);
    }
    expect(getDevice).not.toHaveBeenCalled();
  });
});
