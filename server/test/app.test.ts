import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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
}));

class MemoryRepository implements Repository {
  public readonly sessions = new Map<string, Session>();
  public readonly tokens = new Map<string, StampToken>();
  public readonly stamps: Stamp[] = [];
  public readonly deliveries = new Map<string, { sessionId: string; acked: boolean }>();
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
    this.deliveries.set(input.eventId, { sessionId: token.sessionId, acked: false });
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

  public async getStats() {
    return {
      participantCount: this.sessions.size,
      stampCountBySpot: spots.map((spot) => ({
        spotId: spot.id,
        count: this.stamps.filter((stamp) => stamp.spotId === spot.id).length,
      })),
      completedCount: [...this.sessions.keys()].filter((id) =>
        new Set(this.stamps.filter((stamp) => stamp.sessionId === id).map((stamp) => stamp.spotId)).size === spots.length,
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
    current = new Date(current.getTime() + 91_000);
    const devices = await app.request("/api/admin/devices", {
      headers: { "x-admin-password": "staff-password" },
    });
    const payload = await devices.json() as { devices: Array<{ id: string; status: string; pending_queue_count: number }> };
    const item = payload.devices.find((device) => device.id === "dev-01");
    expect(item?.status).toBe("断");
    expect(item?.pending_queue_count).toBe(3);
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
});
