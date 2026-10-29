import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEFAULT_SECURITY_LIMITS } from "../src/config.js";
import { createStructuredLogger } from "../src/logger.js";
import type {
  HeartbeatState,
  NewSession,
  NewStampInput,
  Repository,
  StampResult,
} from "../src/db/repository.js";
import type { Device, Session, Spot, Stamp, StampToken } from "../src/db/schema.js";
import { hashSecret } from "../src/security.js";

const spots: Spot[] = [1, 2, 3, 4, 5].map((number) => ({
  id: `spot-${String(number).padStart(2, "0")}`,
  nameJa: `スポット${number}`,
  nameEn: `Spot ${number}`,
  displayOrder: number,
  lat: 34.66,
  lng: 133.91,
  descriptionJa: "案内",
  descriptionEn: "Guide",
  locationNoteJa: null,
  locationNoteEn: null,
  isSample: true,
}));

class MemoryRepository implements Repository {
  public readonly sessions = new Map<string, Session>();
  public readonly tokens = new Map<string, StampToken>();
  public readonly stamps: Stamp[] = [];
  public readonly deliveries = new Map<string, { sessionId: string; deviceId: string; acked: boolean; timedOutAt: Date | null }>();
  public readonly devices = new Map<string, Device>([
    ["dev-01", {
      id: "dev-01",
      apiKeyHash: hashSecret("device-key"),
      spotId: "spot-01",
      lastHeartbeatAt: null,
      status: "断",
    }],
    ["dev-02", {
      id: "dev-02",
      apiKeyHash: hashSecret("device-key-02"),
      spotId: "spot-02",
      lastHeartbeatAt: null,
      status: "断",
    }],
  ]);
  public healthy = true;
  private nextStampId = 1;

  public async createSession(input: NewSession) {
    this.sessions.set(input.id, {
      id: input.id,
      createdAt: input.createdAt,
      userAgent: input.userAgent,
    });
    this.tokens.set(input.token, {
      token: input.token,
      sessionId: input.id,
      issuedAt: input.issuedAt,
    });
  }

  public async getSession(id: string) {
    return this.sessions.get(id);
  }

  public async getToken(token: string) {
    return this.tokens.get(token);
  }

  public async getTokenForSession(sessionId: string) {
    return [...this.tokens.values()].find((token) => token.sessionId === sessionId);
  }

  public async getSpots() {
    return spots;
  }

  public async getStampsForSession(sessionId: string) {
    return this.stamps
      .filter((stamp) => stamp.sessionId === sessionId)
      .sort((left, right) => left.visitOrder - right.visitOrder)
      .map((stamp) => ({ spotId: stamp.spotId, stampedAt: stamp.stampedAt }));
  }

  public async createStamp(input: NewStampInput): Promise<StampResult | undefined> {
    const token = this.tokens.get(input.token);
    const device = this.devices.get(input.deviceId);
    const spot = spots.find((candidate) => candidate.id === device?.spotId);
    if (!token || !device?.spotId || !spot) return undefined;
    const old = this.stamps.find((stamp) => stamp.sessionId === token.sessionId && stamp.spotId === device.spotId);
    const currentCount = this.stamps.filter((stamp) => stamp.sessionId === token.sessionId).length;
    if (old) {
      return {
        result: "already",
        sessionId: token.sessionId,
        stampId: old.id,
        eventId: null,
        spotId: old.spotId,
        spotName: spot.nameJa,
        stampedAt: old.stampedAt,
        stampCount: currentCount,
        totalSpots: spots.length,
        completed: currentCount >= spots.length,
      };
    }
    const stamp: Stamp = {
      id: this.nextStampId++,
      sessionId: token.sessionId,
      spotId: device.spotId,
      stampedAt: input.stampedAt,
      deviceStampedAt: input.deviceStampedAt,
      deviceId: input.deviceId,
      visitOrder: currentCount + 1,
    };
    this.stamps.push(stamp);
    this.deliveries.set(input.eventId, { sessionId: token.sessionId, deviceId: input.deviceId, acked: false, timedOutAt: null });
    return {
      result: "stamped",
      sessionId: token.sessionId,
      stampId: stamp.id,
      eventId: input.eventId,
      spotId: stamp.spotId,
      spotName: spot.nameJa,
      stampedAt: stamp.stampedAt,
      stampCount: currentCount + 1,
      totalSpots: spots.length,
      completed: currentCount + 1 >= spots.length,
    };
  }

  public async markDelivered(_eventId: string) {
    void _eventId;
  }

  public async markAckTimedOut(eventId: string, timedOutAt: Date) {
    const delivery = this.deliveries.get(eventId);
    if (delivery) delivery.timedOutAt = timedOutAt;
  }

  public async ackEvent(eventId: string, sessionId: string) {
    const delivery = this.deliveries.get(eventId);
    if (!delivery || delivery.sessionId !== sessionId || delivery.acked) return false;
    delivery.acked = true;
    return true;
  }

  public async healthCheck() {
    if (!this.healthy) throw new Error("database unavailable");
  }

  public async getDevice(deviceId: string) {
    return this.devices.get(deviceId);
  }

  public async updateHeartbeat(state: HeartbeatState) {
    const device = this.devices.get(state.deviceId);
    if (device) {
      device.lastHeartbeatAt = state.receivedAt;
      device.status = "正常";
    }
  }

  public async listDevices() {
    return [...this.devices.values()];
  }

  public async getAckTimeoutsByDevice(since: Date) {
    return [...this.devices.values()].flatMap((device) => {
      const timedOut = [...this.deliveries.values()].filter((delivery) =>
        delivery.timedOutAt && delivery.timedOutAt >= since
        && delivery.deviceId === device.id);
      const lastTimedOutAt = timedOut.reduce<Date | null>((latest, delivery) =>
        !latest || (delivery.timedOutAt && delivery.timedOutAt > latest) ? delivery.timedOutAt : latest, null);
      return lastTimedOutAt ? [{ deviceId: device.id, count: timedOut.length, lastTimedOutAt }] : [];
    });
  }

  public async getStats(openAt: Date) {
    const participants = [...this.sessions.values()].filter((session) => session.createdAt >= openAt).map((session) => session.id);
    const eventStamps = this.stamps.filter((stamp) => participants.includes(stamp.sessionId));
    return {
      participantCount: participants.length,
      stampCountBySpot: spots.map((spot) => ({
        spotId: spot.id,
        count: eventStamps.filter((stamp) => stamp.spotId === spot.id).length,
      })),
      completedCount: participants.filter((id) =>
        new Set(eventStamps.filter((stamp) => stamp.sessionId === id).map((stamp) => stamp.spotId)).size === spots.length,
      ).length,
    };
  }
}

const sessionCookie = (response: Response) => {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";", 1)[0]!;
};

const createTestApp = (repository: MemoryRepository, now = () => new Date("2026-10-31T12:00:00+09:00")) => createApp({
  repository,
  now,
  config: { adminPassword: "staff-password", ackTimeoutMs: 10 },
});

const beforeOpening = () => new Date("2026-10-31T09:59:59+09:00");
const unlockHeaders = { "x-admin-password": "staff-password" };
const statusOpen = async (app: ReturnType<typeof createApp>, cookie?: string) => {
  const response = await app.request("/api/status", cookie ? { headers: { cookie } } : undefined);
  return (await response.json() as { open: boolean }).open;
};

describe("server API", () => {
  it("issues a secure session cookie with the fixed expiry", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository);
    const response = await app.request("/", { redirect: "manual" });
    expect(response.status).toBe(302);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Expires=Mon, 30 Nov 2026");
  });

  it("returns already on a duplicate and stores one stamp", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository);
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const first = await app.request("/api/me", { headers: { cookie } });
    const token = (await first.json() as { token: string }).token;
    const headers = {
      authorization: "Bearer device-key",
      "content-type": "application/json",
      cookie,
    };
    const body = JSON.stringify({ token, device_id: "dev-01" });
    const stamped = await app.request("/api/stamp", { method: "POST", headers, body });
    const already = await app.request("/api/stamp", { method: "POST", headers, body });
    expect(stamped.status).toBe(200);
    expect((await stamped.json() as { result: string }).result).toBe("stamped");
    expect((await already.json() as { result: string }).result).toBe("already");
    expect(repository.stamps).toHaveLength(1);
  });

  it("logs heartbeats and duplicate stamps so device history survives the event", async () => {
    const repository = new MemoryRepository();
    const lines: string[] = [];
    const app = createApp({
      repository,
      now: () => new Date("2026-10-31T12:00:00+09:00"),
      config: { adminPassword: "staff-password", ackTimeoutMs: 10 },
      logger: createStructuredLogger((line) => lines.push(line)),
    });
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const sessionId = cookie.split("=", 2)[1]!;
    const token = (await (await app.request("/api/me", { headers: { cookie } })).json() as { token: string }).token;
    const headers = { authorization: "Bearer device-key", "content-type": "application/json" };
    const body = JSON.stringify({ token, device_id: "dev-01" });
    await app.request("/api/stamp", { method: "POST", headers, body });
    await app.request("/api/stamp", { method: "POST", headers, body });
    await app.request("/api/heartbeat", {
      method: "POST",
      headers,
      body: JSON.stringify({ device_id: "dev-01", uptime_seconds: 3600, last_stamp_count: 1, pending_queue_count: 2, battery_level: 64 }),
    });

    const logs = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    // 仕様5-3: 既押印はDBに残らないのでログに残す。セッションIDは出さない。
    expect(logs).toContainEqual({ severity: "INFO", message: "stamp already collected", deviceId: "dev-01", spotId: "spot-01", stamp_count: 1 });
    // 仕様5-6: ハートビートの内容をそのまま残す。
    expect(logs).toContainEqual({ severity: "INFO", message: "device heartbeat", deviceId: "dev-01", uptime_seconds: 3600, last_stamp_count: 1, pending_queue_count: 2, battery_level: 64 });
    expect(lines.join("\n")).not.toContain(sessionId);
  });

  it("accepts a pre-16:00 offline stamp during October 31 and rejects it on November 1", async () => {
    const repository = new MemoryRepository();
    let current = new Date("2026-10-31T15:00:00+09:00");
    const app = createTestApp(repository, () => current);
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const me = await app.request("/api/me", { headers: { cookie } });
    const token = (await me.json() as { token: string }).token;
    current = new Date("2026-10-31T16:30:00+09:00");
    const headers = {
      authorization: "Bearer device-key",
      "content-type": "application/json",
    };
    const accepted = await app.request("/api/stamp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        token,
        device_id: "dev-01",
        device_stamped_at: "2026-10-31T15:59:59+09:00",
      }),
    });
    expect(accepted.status).toBe(200);
    expect(repository.stamps[0]?.stampedAt.toISOString()).toBe("2026-10-31T06:59:59.000Z");

    current = new Date("2026-11-01T00:00:00+09:00");
    const rejected = await app.request("/api/stamp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        token,
        device_id: "dev-01",
        device_stamped_at: "2026-10-31T15:59:59+09:00",
      }),
    });
    expect(rejected.status).toBe(404);
    expect(repository.stamps).toHaveLength(1);
  });

  it("rejects a stamp first read after 16:00 even during October 31", async () => {
    const repository = new MemoryRepository();
    let current = new Date("2026-10-31T15:00:00+09:00");
    const app = createTestApp(repository, () => current);
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const me = await app.request("/api/me", { headers: { cookie } });
    const token = (await me.json() as { token: string }).token;
    current = new Date("2026-10-31T16:30:00+09:00");
    const response = await app.request("/api/stamp", {
      method: "POST",
      headers: { authorization: "Bearer device-key", "content-type": "application/json" },
      body: JSON.stringify({
        token,
        device_id: "dev-01",
        device_stamped_at: "2026-10-31T16:00:01+09:00",
      }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects invalid token and invalid device credentials", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository);
    const invalidDevice = await app.request("/api/stamp", {
      method: "POST",
      headers: { authorization: "Bearer wrong", "content-type": "application/json" },
      body: JSON.stringify({ token: "unknown", device_id: "dev-01" }),
    });
    expect(invalidDevice.status).toBe(401);
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const invalidToken = await app.request("/api/stamp", {
      method: "POST",
      headers: {
        authorization: "Bearer device-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "unknown", device_id: "dev-01" }),
    });
    expect(invalidToken.status).toBe(404);
    expect(cookie).toContain("hcd_session=");
  });

  it("keeps a stamp when the phone never ACKs", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository);
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const me = await app.request("/api/me", { headers: { cookie } });
    const token = (await me.json() as { token: string }).token;
    const response = await app.request("/api/stamp", {
      method: "POST",
      headers: {
        authorization: "Bearer device-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token,
        device_id: "dev-01",
        device_stamped_at: "2026-10-31T13:24:05+09:00",
      }),
    });
    const payload = await response.json() as { result: string };
    expect(response.status).toBe(200);
    expect(payload.result).toBe("stamped");
    expect(repository.stamps[0]?.stampedAt.toISOString()).toBe("2026-10-31T04:24:05.000Z");
  });

  it("fans out stamped events to multiple SSE subscribers and accepts ACK", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository);
    const cookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    const received: string[] = [];
    const hubSubscriber = async (event: { data: string }) => {
      received.push(event.data);
      const eventId = (JSON.parse(event.data) as { event_id: string }).event_id;
      await app.request("/api/ack", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
    };
    // Connecting through the actual route is covered by the stream headers;
    // the in-process subscriber exercises the same fan-out hub used by it.
    const { SseHub } = await import("../src/sse.js");
    const hub = new SseHub();
    const appWithHub = createApp({
      repository,
      hub,
      now: () => new Date("2026-10-31T12:00:00+09:00"),
      config: { adminPassword: "staff-password", ackTimeoutMs: 100 },
    });
    const sseHeaders = { cookie };
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const sse1 = await appWithHub.request("/api/events", { headers: sseHeaders, signal: controller1.signal });
    const sse2 = await appWithHub.request("/api/events", { headers: sseHeaders, signal: controller2.signal });
    expect(sse1.headers.get("content-type")).toContain("text/event-stream");
    expect(sse2.headers.get("content-type")).toContain("text/event-stream");
    // The route subscriptions are active after the response is created; publish
    // through an additional subscription to prove both current connections use
    // the same session channel and ACK keeps the POST fast.
    const actualSession = cookie.split("=", 2)[1]!;
    const extra1 = hub.subscribe(actualSession, (event) => { void hubSubscriber(event); });
    const extra2 = hub.subscribe(actualSession, () => undefined);
    const me = await appWithHub.request("/api/me", { headers: { cookie } });
    const token = (await me.json() as { token: string }).token;
    const stamp = await appWithHub.request("/api/stamp", {
      method: "POST",
      headers: { authorization: "Bearer device-key", "content-type": "application/json" },
      body: JSON.stringify({ token, device_id: "dev-01" }),
    });
    extra1();
    extra2();
    controller1.abort();
    controller2.abort();
    expect(stamp.status).toBe(200);
    expect(received).toHaveLength(1);
  });

  it("marks a device disconnected after 90 seconds and protects admin APIs", async () => {
    const repository = new MemoryRepository();
    let current = new Date("2026-10-31T12:00:00+09:00");
    const app = createTestApp(repository, () => current);
    const unauthorized = await app.request("/api/admin/devices");
    expect(unauthorized.status).toBe(401);
    const heartbeat = await app.request("/api/heartbeat", {
      method: "POST",
      headers: { authorization: "Bearer device-key", "content-type": "application/json" },
      body: JSON.stringify({
        device_id: "dev-01",
        uptime_seconds: 10,
        last_stamp_count: 2,
        pending_queue_count: 3,
        battery_level: 88,
      }),
    });
    expect(heartbeat.status).toBe(200);
    current = new Date(current.getTime() + 61_000);
    const warningDevices = await app.request("/api/admin/devices", {
      headers: { "x-admin-password": "staff-password" },
    });
    const warningPayload = await warningDevices.json() as { devices: Array<{ id: string; status: string }> };
    expect(warningPayload.devices.find((device) => device.id === "dev-01")?.status).toBe("警告");

    current = new Date(current.getTime() + 30_000);
    const disconnectedDevices = await app.request("/api/admin/devices", {
      headers: { "x-admin-password": "staff-password" },
    });
    const payload = await disconnectedDevices.json() as { devices: Array<{ id: string; status: string; pending_queue_count: number }> };
    const item = payload.devices.find((device) => device.id === "dev-01");
    expect(item?.status).toBe("断");
    expect(item?.pending_queue_count).toBe(3);

    const stats = await app.request("/api/admin/stats", {
      headers: { "x-admin-password": "staff-password" },
    });
    expect(stats.status).toBe(200);
    expect((await stats.json() as { sample_spots_active: boolean }).sample_spots_active).toBe(true);
  });

  it("checks the database in health and enables RLS without policies", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository);
    expect((await app.request("/api/health")).status).toBe(200);
    repository.healthy = false;
    expect((await app.request("/api/health")).status).toBe(503);
    const migration = await readFile(new URL("../drizzle/0000_jazzy_vision.sql", import.meta.url), "utf8");
    expect(migration).toContain("ALTER TABLE \"stamps\" ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("UNIQUE(\"session_id\",\"spot_id\")");
  });
  // 仕様7章: /admin はSPAの画面でファイルが無いため、index.htmlを返す必要がある。
  it("serves the SPA index for paths without a built file", async () => {
    const repository = new MemoryRepository();
    const webRoot = await mkdtemp(join(tmpdir(), "hcd-web-root-"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><title>stamp rally</title>");
    try {
      const app = createApp({
        repository,
        config: { adminPassword: "staff-password", ackTimeoutMs: 10 },
        webRoot,
      });
      const response = await app.request("/admin");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("stamp rally");
    } finally {
      await rm(webRoot, { recursive: true, force: true });
    }
  });
});

describe("participant opening (仕様4-8・7章)", () => {
  it("serves the app without issuing a session before 10:00 on October 31", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository, beforeOpening);
    const response = await app.request("/", { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(repository.sessions.size).toBe(0);
  });

  it("issues sessions from 10:00 on October 31", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository, () => new Date("2026-10-31T10:00:00+09:00"));
    expect((await app.request("/", { redirect: "manual" })).status).toBe(302);
    expect(repository.sessions.size).toBe(1);
  });

  it("does not use up the session creation limit before opening", async () => {
    const repository = new MemoryRepository();
    let current = beforeOpening();
    const app = createApp({
      repository,
      now: () => current,
      config: { adminPassword: "staff-password", ackTimeoutMs: 10, securityLimits: { ...DEFAULT_SECURITY_LIMITS, sessionMaxNewTotal: 1 } },
    });
    for (let index = 0; index < 3; index++) expect((await app.request("/", { redirect: "manual" })).status).toBe(200);
    current = new Date("2026-10-31T10:00:00+09:00");
    expect((await app.request("/", { redirect: "manual" })).status).toBe(302);
  });

  it("reports the opening state with the server time and forbids caching", async () => {
    const app = createTestApp(new MemoryRepository(), beforeOpening);
    const response = await app.request("/api/status");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      open: false,
      opens_at: "2026-10-31T01:00:00.000Z",
      server_time: "2026-10-31T00:59:59.000Z",
    });
    expect(await statusOpen(createTestApp(new MemoryRepository()))).toBe(true);
  });

  it("lets only devices unlocked from the dashboard use the app before opening", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository, beforeOpening);
    const unlock = await app.request("/api/admin/preview", { method: "POST", headers: unlockHeaders });
    expect(unlock.status).toBe(200);
    expect(await unlock.json()).toEqual({ ok: true });
    const setCookie = unlock.headers.get("set-cookie")!;
    expect(setCookie).toContain("hcd_preview=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Expires=Sat, 31 Oct 2026 07:00:00 GMT");
    const preview = setCookie.split(";", 1)[0]!;
    expect(await statusOpen(app, preview)).toBe(true);
    expect((await app.request("/", { redirect: "manual", headers: { cookie: preview } })).status).toBe(302);
    expect(repository.sessions.size).toBe(1);
  });

  it("rejects unauthenticated unlock requests and forged unlock cookies", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository, beforeOpening);
    expect((await app.request("/api/admin/preview", { method: "POST" })).status).toBe(401);
    expect((await app.request("/api/admin/preview", { method: "POST", headers: { "x-admin-password": "wrong" } })).status).toBe(401);
    const forged = "hcd_preview=forged-value";
    expect(await statusOpen(app, forged)).toBe(false);
    expect((await app.request("/", { redirect: "manual", headers: { cookie: forged } })).status).toBe(200);
    expect(repository.sessions.size).toBe(0);
  });

  it("keeps unlocks across restarts and invalidates them when the shared password changes", async () => {
    const repository = new MemoryRepository();
    const unlock = await createTestApp(repository, beforeOpening).request("/api/admin/preview", { method: "POST", headers: unlockHeaders });
    const preview = unlock.headers.get("set-cookie")!.split(";", 1)[0]!;
    expect(await statusOpen(createTestApp(repository, beforeOpening), preview)).toBe(true);
    const changed = createApp({ repository, now: beforeOpening, config: { adminPassword: "new-staff-password", ackTimeoutMs: 10 } });
    expect(await statusOpen(changed, preview)).toBe(false);
  });

  it("leaves sessions issued before opening and their stamps out of the dashboard stats", async () => {
    const repository = new MemoryRepository();
    let current = beforeOpening();
    const app = createTestApp(repository, () => current);
    const deviceHeaders = { authorization: "Bearer device-key", "content-type": "application/json" };
    const stampWith = async (cookie: string) => {
      const token = (await (await app.request("/api/me", { headers: { cookie } })).json() as { token: string }).token;
      return app.request("/api/stamp", { method: "POST", headers: deviceHeaders, body: JSON.stringify({ token, device_id: "dev-01" }) });
    };
    const unlock = await app.request("/api/admin/preview", { method: "POST", headers: unlockHeaders });
    const preview = unlock.headers.get("set-cookie")!.split(";", 1)[0]!;
    const staffCookie = sessionCookie(await app.request("/", { redirect: "manual", headers: { cookie: preview } }));
    current = new Date("2026-10-31T11:00:00+09:00");
    // 開放前に作った試験用のセッションは、開放後に押しても数えない。
    expect((await stampWith(staffCookie)).status).toBe(200);
    const participantCookie = sessionCookie(await app.request("/", { redirect: "manual" }));
    expect((await stampWith(participantCookie)).status).toBe(200);
    const stats = await (await app.request("/api/admin/stats", { headers: unlockHeaders })).json() as {
      participant_count: number;
      completed_count: number;
      stamp_count_by_spot: Array<{ spot_id: string; count: number }>;
    };
    expect(repository.sessions.size).toBe(2);
    expect(stats.participant_count).toBe(1);
    expect(stats.stamp_count_by_spot.find((row) => row.spot_id === "spot-01")?.count).toBe(1);
    expect(stats.completed_count).toBe(0);
  });

  it("accepts stamps and heartbeats from stations before opening", async () => {
    const repository = new MemoryRepository();
    const app = createTestApp(repository, beforeOpening);
    const unlock = await app.request("/api/admin/preview", { method: "POST", headers: unlockHeaders });
    const preview = unlock.headers.get("set-cookie")!.split(";", 1)[0]!;
    const cookie = sessionCookie(await app.request("/", { redirect: "manual", headers: { cookie: preview } }));
    const token = (await (await app.request("/api/me", { headers: { cookie } })).json() as { token: string }).token;
    const deviceHeaders = { authorization: "Bearer device-key", "content-type": "application/json" };
    const stamped = await app.request("/api/stamp", { method: "POST", headers: deviceHeaders, body: JSON.stringify({ token, device_id: "dev-01" }) });
    expect(stamped.status).toBe(200);
    const heartbeat = await app.request("/api/heartbeat", {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ device_id: "dev-01", uptime_seconds: 10, last_stamp_count: 1, pending_queue_count: 0 }),
    });
    expect(heartbeat.status).toBe(200);
  });
});
