import { randomUrlSafe, hashSecret, readAdminPassword, readDeviceApiKey, secretsEqual, SESSION_COOKIE } from "./security.js";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  ackRequestSchema,
  heartbeatRequestSchema,
  stampRequestSchema,
} from "@hcd-stamp-rally/shared";
import {
  DEFAULT_ACK_TIMEOUT_MS,
  EVENT_END_AT,
  SESSION_COOKIE_EXPIRES_AT,
  SSE_PING_INTERVAL_MS,
  type ServerConfig,
} from "./config.js";
import type { Repository } from "./db/repository.js";
import { AckTracker, SseHub } from "./sse.js";
import { HeartbeatMonitor } from "./heartbeat.js";

export type AppDependencies = {
  repository: Repository;
  config?: Partial<ServerConfig>;
  hub?: SseHub;
  ackTracker?: AckTracker;
  heartbeatMonitor?: HeartbeatMonitor;
  now?: () => Date;
};

const jsonError = (message: string) => ({
  error: message,
});

const parseJson = async <Schema extends z.ZodTypeAny>(request: Request, schema: Schema): Promise<z.infer<Schema> | undefined> => {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export function createApp(dependencies: AppDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const config = {
    ackTimeoutMs: dependencies.config?.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS,
    adminPassword: dependencies.config?.adminPassword ?? "",
  };
  const hub = dependencies.hub ?? new SseHub();
  const ackTracker = dependencies.ackTracker ?? new AckTracker();
  const heartbeat = dependencies.heartbeatMonitor
    ?? new HeartbeatMonitor(dependencies.repository, now);
  const app = new Hono();

  const issueSession = async (c: Context) => {
    const sessionId = randomUrlSafe();
    const token = randomUrlSafe();
    const current = now();
    await dependencies.repository.createSession({
      id: sessionId,
      token,
      createdAt: current,
      issuedAt: current,
      userAgent: c.req.header("user-agent") ?? "",
    });
    const maxAge = Math.max(0, Math.ceil((SESSION_COOKIE_EXPIRES_AT.getTime() - current.getTime()) / 1000));
    setCookie(c, SESSION_COOKIE, sessionId, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      expires: SESSION_COOKIE_EXPIRES_AT,
      maxAge,
    });
    return sessionId;
  };

  const getSessionId = (c: Context) => getCookie(c, SESSION_COOKIE);

  const requireSession = async (c: Context): Promise<string | Response> => {
    const sessionId = getSessionId(c);
    if (!sessionId || !(await dependencies.repository.getSession(sessionId))) {
      return c.json(jsonError("session_required"), 401);
    }
    return sessionId;
  };

  const requireDevice = async (c: Context, deviceId: string): Promise<boolean> => {
    const key = readDeviceApiKey(c.req.header("authorization"), c.req.header("x-api-key"));
    if (!key) return false;
    const device = await dependencies.repository.getDevice(deviceId);
    return Boolean(device && secretsEqual(device.apiKeyHash, hashSecret(key)));
  };

  const requireAdmin = (c: Context): boolean => {
    const provided = readAdminPassword(c.req.raw);
    return Boolean(config.adminPassword && provided && secretsEqual(provided, config.adminPassword));
  };

  // 仕様5-1: 初回アクセスでセッションを発行し、HttpOnly・Secure・SameSite=Lax Cookieを設定する。
  app.get("/", async (c) => {
    const existing = getSessionId(c);
    if (!existing || !(await dependencies.repository.getSession(existing))) {
      await issueSession(c);
      return c.redirect("/", 302);
    }
    return c.json({ ok: true });
  });

  // 仕様9章: 参加者の押印トークンと押印状態を返す。
  app.get("/api/me", async (c) => {
    const sessionId = await requireSession(c);
    if (typeof sessionId !== "string") return sessionId;
    const token = await dependencies.repository.getTokenForSession(sessionId);
    if (!token) return c.json(jsonError("session_required"), 401);
    const stampRows = await dependencies.repository.getStampsForSession(sessionId);
    const spots = await dependencies.repository.getSpots();
    return c.json({
      token: token.token,
      token_expires_at: EVENT_END_AT.toISOString(),
      stamps: stampRows.map((stamp) => ({
        spot_id: stamp.spotId,
        stamped_at: stamp.stampedAt.toISOString(),
      })),
      completed: spots.length > 0 && stampRows.length >= spots.length,
    });
  });

  // 仕様9章・4-6: スポットはシードデータから読み出し、Webへ返す。
  app.get("/api/spots", async (c) => {
    const rows = await dependencies.repository.getSpots();
    return c.json({ spots: rows.map((spot) => ({
      id: spot.id,
      name_ja: spot.nameJa,
      name_en: spot.nameEn,
      display_order: spot.displayOrder,
      lat: spot.lat,
      lng: spot.lng,
      description_ja: spot.descriptionJa,
      description_en: spot.descriptionEn,
      location_note_ja: spot.locationNoteJa,
      location_note_en: spot.locationNoteEn,
    })) });
  });

  // 仕様5-4: 同一セッションの全SSE接続へ stamped と15秒ごとの pingを配信する。
  app.get("/api/events", async (c) => {
    const sessionId = await requireSession(c);
    if (typeof sessionId !== "string") return sessionId;
    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe(sessionId, (event) => {
        void stream.writeSSE({
          id: event.id,
          event: event.event,
          data: event.data,
        });
      });
      const pingTimer = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "{}" });
      }, SSE_PING_INTERVAL_MS);
      const close = () => {
        clearInterval(pingTimer);
        unsubscribe();
      };
      stream.onAbort(close);
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
      close();
    });
  });

  // 仕様5-3/5-5: APIキー認証後に期限・トークン・スポットを検証し、DB一意制約で冪等に保存する。
  app.post("/api/stamp", async (c) => {
    const raw = await parseJson(c.req.raw, stampRequestSchema);
    if (!raw) return c.json(jsonError("invalid_request"), 400);
    if (!(await requireDevice(c, raw.device_id))) {
      return c.json(jsonError("unauthorized"), 401);
    }
    const current = now();
    const token = await dependencies.repository.getToken(raw.token);
    if (!token || current > EVENT_END_AT) {
      return c.json(jsonError("invalid_token"), 404);
    }
    const eventId = `evt_${randomUrlSafe(18)}`;
    const deviceStampedAt = raw.device_stamped_at ? new Date(raw.device_stamped_at) : null;
    const result = await dependencies.repository.createStamp({
      token: raw.token,
      deviceId: raw.device_id,
      stampedAt: deviceStampedAt ?? current,
      deviceStampedAt,
      eventId,
    });
    if (!result) return c.json(jsonError("invalid_token"), 404);

    if (result.result === "already" || !result.eventId) {
      return c.json({
        result: "already",
        spot_id: result.spotId,
        spot_name: result.spotName,
        stamp_count: result.stampCount,
        total_spots: result.totalSpots,
        completed: result.completed,
      });
    }

    const stampedEvent = {
      event_id: result.eventId,
      spot_id: result.spotId,
      stamped_at: result.stampedAt.toISOString(),
      stamp_count: result.stampCount,
      total_spots: result.totalSpots,
      completed: result.completed,
    };
    const ackWait = ackTracker.wait(result.eventId, config.ackTimeoutMs);
    const subscribers = hub.publishStamped(result.sessionId, stampedEvent);
    if (subscribers > 0) await dependencies.repository.markDelivered(result.eventId);
    await ackWait;
    return c.json({
      result: "stamped",
      spot_id: result.spotId,
      spot_name: result.spotName,
      stamp_count: result.stampCount,
      total_spots: result.totalSpots,
      completed: result.completed,
    });
  });

  // 仕様5-4/9章: イベントIDとHttpOnly Cookieのセッションを突き合わせてACKする。
  app.post("/api/ack", async (c) => {
    const sessionId = await requireSession(c);
    if (typeof sessionId !== "string") return sessionId;
    const raw = await parseJson(c.req.raw, ackRequestSchema);
    if (!raw) return c.json(jsonError("invalid_request"), 400);
    const accepted = await dependencies.repository.ackEvent(raw.event_id, sessionId);
    if (!accepted) return c.json(jsonError("invalid_event"), 404);
    ackTracker.resolve(raw.event_id, true);
    return c.json({ ok: true });
  });

  // 仕様5-5/5-6: 機体のAPIキーで認証し、30秒ごとの死活情報を受け取る。
  app.post("/api/heartbeat", async (c) => {
    const raw = await parseJson(c.req.raw, heartbeatRequestSchema);
    if (!raw) return c.json(jsonError("invalid_request"), 400);
    if (!(await requireDevice(c, raw.device_id))) {
      return c.json(jsonError("unauthorized"), 401);
    }
    await heartbeat.record({
      deviceId: raw.device_id,
      lastStampCount: raw.last_stamp_count,
      pendingQueueCount: raw.pending_queue_count,
      batteryLevel: raw.battery_level ?? null,
    });
    return c.json({ ok: true });
  });

  // 仕様9章・8章: DBへの問い合わせを含めたヘルスチェック。
  app.get("/api/health", async (c) => {
    try {
      await dependencies.repository.healthCheck();
      return c.json({ ok: true, db: "ok" });
    } catch {
      return c.json({ ok: false, db: "error" }, 503);
    }
  });

  // 仕様7章: 管理APIは共有パスワードで保護する。
  app.get("/api/admin/devices", async (c) => {
    if (!requireAdmin(c)) return c.json(jsonError("unauthorized"), 401);
    const devices = await heartbeat.list();
    return c.json({ devices: devices.map((device) => ({
      id: device.id,
      spot_id: device.spotId,
      last_heartbeat_at: device.lastHeartbeatAt?.toISOString() ?? null,
      status: device.status,
      last_stamp_count: device.lastStampCount,
      pending_queue_count: device.pendingQueueCount,
      battery_level: device.batteryLevel,
    })) });
  });

  app.get("/api/admin/stats", async (c) => {
    if (!requireAdmin(c)) return c.json(jsonError("unauthorized"), 401);
    const stats = await dependencies.repository.getStats();
    return c.json({
      participant_count: stats.participantCount,
      stamp_count_by_spot: stats.stampCountBySpot.map((row) => ({ spot_id: row.spotId, count: row.count })),
      completed_count: stats.completedCount,
    });
  });

  return app;
}
