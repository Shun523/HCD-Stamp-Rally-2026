import { randomUrlSafe, hashSecret, previewCookieValue, readAdminPassword, readDeviceApiKey, secretsEqual, PREVIEW_COOKIE, SESSION_COOKIE } from "./security.js";
import { performance } from "node:perf_hooks";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  ackRequestSchema,
  apiErrorResponseSchema,
  heartbeatRequestSchema,
  stampRequestSchema,
  type AdminPreviewResponse,
  type StatusResponse,
} from "@hcd-stamp-rally/shared";
import {
  DEFAULT_ACK_TIMEOUT_MS,
  DEFAULT_SECURITY_LIMITS,
  EVENT_END_AT,
  OFFLINE_RESEND_END_AT,
  PARTICIPANT_OPEN_AT,
  SESSION_COOKIE_EXPIRES_AT,
  SSE_PING_INTERVAL_MS,
  type ServerConfig,
} from "./config.js";
import type { Repository } from "./db/repository.js";
import { AckTracker, SseConnectionBudget, SseHub } from "./sse.js";
import { clientAddress } from "./client-address.js";
import { FixedWindowLimiter } from "./rate-limit.js";
import { HeartbeatMonitor } from "./heartbeat.js";
import { createStructuredLogger, type Logger } from "./logger.js";

export type AppDependencies = {
  repository: Repository;
  config?: Partial<ServerConfig>;
  hub?: SseHub;
  ackTracker?: AckTracker;
  heartbeatMonitor?: HeartbeatMonitor;
  now?: () => Date;
  monotonicNow?: () => number;
  logger?: Logger;
  webRoot?: string;
  /** HTTPのローカルE2Eに限りfalseを渡す。本番は常にSecure Cookie。 */
  secureCookies?: boolean;
};

const jsonError = (message: string) => apiErrorResponseSchema.parse({
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
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const logger = dependencies.logger ?? createStructuredLogger();
  const config = {
    ackTimeoutMs: dependencies.config?.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS,
    adminPassword: dependencies.config?.adminPassword ?? "",
    // 仕様4-8: 開放時刻はローカル開発と自動テストだけ上書きする。
    participantOpenAt: dependencies.config?.participantOpenAt ?? PARTICIPANT_OPEN_AT,
  };
  const hub = dependencies.hub ?? new SseHub();
  const ackTracker = dependencies.ackTracker ?? new AckTracker();
  const heartbeat = dependencies.heartbeatMonitor
    ?? new HeartbeatMonitor(dependencies.repository, now);
  const app = new Hono();
  const staticAssets = dependencies.webRoot
    ? serveStatic({ root: dependencies.webRoot })
    : undefined;
  const staticIndex = dependencies.webRoot
    ? serveStatic({ root: dependencies.webRoot, path: "index.html" })
    : undefined;
  const secureCookies = dependencies.secureCookies ?? true;
  const limits = dependencies.config?.securityLimits ?? DEFAULT_SECURITY_LIMITS;
  const trustedProxyHops = dependencies.config?.trustedProxyHops ?? 0;
  // 接続元を無制限に保存しない。IPは一時メモリのみで、DBやログへ書かない。
  const maxLimiterKeys = 10_000;
  const adminFailures = new FixedWindowLimiter(limits.adminMaxFailures, limits.adminFailureWindowMs, maxLimiterKeys, monotonicNow);
  const sessionsBySource = new FixedWindowLimiter(limits.sessionMaxNewPerSource, limits.sessionCreationWindowMs, maxLimiterKeys, monotonicNow);
  const sessionsGlobally = new FixedWindowLimiter(limits.sessionMaxNewTotal, limits.sessionCreationWindowMs, 1, monotonicNow);
  const sseConnections = new SseConnectionBudget(limits.sseMaxPerSession, limits.sseMaxTotal);
  const rateLimited = (c: Context, retryAfter: number, error = "rate_limited") => {
    c.header("Retry-After", String(retryAfter));
    c.header("Cache-Control", "no-store");
    // 仕様4-1: 初回アクセスはAPIの内部コードを見せず、日英で再アクセスを案内する。
    if (c.req.path === "/") {
      return c.text(`アクセスが集中しています。${retryAfter}秒ほど待って、もう一度QRコードを読み込んでください。\nPlease wait about ${retryAfter} seconds and scan the QR code again.`, 429);
    }
    return c.json(jsonError(error), 429);
  };

  // 仕様9章・11章: JSON解析より先に送信サイズを制限し、認証前の大きな入力も拒否する。
  app.use("*", bodyLimit({
    maxSize: limits.maxRequestBodyBytes,
    onError: (c) => c.json(jsonError("payload_too_large"), 413),
  }));

  const issueSession = async (c: Context) => {
    const sessionId = randomUrlSafe();
    // 仕様4-2/5-2: 128bitを保ちつつ、75px QR向けに約22文字へ抑える。
    const token = randomUrlSafe(16);
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
      secure: secureCookies,
      sameSite: "Lax",
      expires: SESSION_COOKIE_EXPIRES_AT,
      maxAge,
    });
    return sessionId;
  };

  const getSessionId = (c: Context) => {
    const value = getCookie(c, SESSION_COOKIE);
    return value && value.length <= 64 ? value : undefined;
  };

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

  const requireAdmin = (c: Context): Response | undefined => {
    const address = clientAddress(c, trustedProxyHops);
    const retryAfter = adminFailures.retryAfter(address);
    if (retryAfter > 0) return rateLimited(c, retryAfter);
    const provided = readAdminPassword(c.req.raw);
    if (config.adminPassword && provided && secretsEqual(provided, config.adminPassword)) {
      adminFailures.reset(address);
      return undefined;
    }
    adminFailures.take(address);
    logger.warn("admin authentication failed", { path: c.req.path });
    return c.json(jsonError("unauthorized"), 401);
  };

  // 仕様7章: 解除Cookieは共有パスワードから都度計算して照合する。パスワード未設定なら誰も解除できない。
  const hasPreviewAccess = (c: Context) => {
    const value = getCookie(c, PREVIEW_COOKIE);
    return Boolean(config.adminPassword && value && secretsEqual(value, previewCookieValue(config.adminPassword)));
  };

  // 仕様4-8: 一般開放後は全員、開放前は管理画面で解除した端末だけを参加者として扱う。
  const isOpenFor = (c: Context, current = now()) => current >= config.participantOpenAt || hasPreviewAccess(c);

  // 仕様5-1・4-8: 初回アクセスでセッションを発行し、HttpOnly・Secure・SameSite=Lax Cookieを設定する。
  // 一般開放前は発行せず上限カウントも消費しない。Webアプリが待機画面を出す。
  app.get("/", async (c, next) => {
    const existing = getSessionId(c);
    if (isOpenFor(c) && (!existing || !(await dependencies.repository.getSession(existing)))) {
      const address = clientAddress(c, trustedProxyHops);
      const retryAfter = Math.max(sessionsBySource.retryAfter(address), sessionsGlobally.retryAfter("global"));
      if (retryAfter > 0) return rateLimited(c, retryAfter);
      // 同期的に両方の枠を確保してからDBへ書くため、同時アクセスでも上限を超えない。
      sessionsBySource.take(address);
      sessionsGlobally.take("global");
      await issueSession(c);
      return c.redirect("/", 302);
    }
    // 仕様2章: セッション発行後は同じサーバーからSPAを返し、CookieとSSEを同一オリジンにする。
    if (staticAssets) return staticAssets(c, next);
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
      is_sample: spot.isSample,
    })) });
  });

  // 仕様4-8・9章: 一般開放の状態をサーバー時刻で返す。DBには触れず、キャッシュさせない。
  app.get("/api/status", (c) => {
    const current = now();
    const body: StatusResponse = {
      open: isOpenFor(c, current),
      opens_at: config.participantOpenAt.toISOString(),
      server_time: current.toISOString(),
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  // 仕様5-4: 同一セッションの全SSE接続へ stamped と15秒ごとの pingを配信する。
  app.get("/api/events", async (c) => {
    const sessionId = await requireSession(c);
    if (typeof sessionId !== "string") return sessionId;
    const release = sseConnections.reserve(sessionId);
    if (!release) return rateLimited(c, Math.ceil(SSE_PING_INTERVAL_MS / 1_000), "too_many_connections");
    return streamSSE(c, async (stream) => {
      let unsubscribe = () => {};
      let pingTimer: ReturnType<typeof setInterval> | undefined;
      let resolveClosed = () => {};
      let closed = false;
      const closedPromise = new Promise<void>((resolve) => { resolveClosed = resolve; });
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingTimer);
        unsubscribe();
        release();
        resolveClosed();
      };
      const abort = () => { stream.abort(); close(); };
      stream.onAbort(close);
      c.req.raw.signal.addEventListener("abort", abort, { once: true });
      try {
        if (c.req.raw.signal.aborted || stream.aborted) return;
        unsubscribe = hub.subscribe(sessionId, (event) => {
          void stream.writeSSE({ id: event.id, event: event.event, data: event.data }).catch(abort);
        });
        pingTimer = setInterval(() => {
          void stream.writeSSE({ event: "ping", data: "{}" }).catch(abort);
        }, SSE_PING_INTERVAL_MS);
        await closedPromise;
      } finally {
        c.req.raw.signal.removeEventListener("abort", abort);
        close();
      }
    });
  });

  // 仕様5-3/5-5: APIキー認証後に期限・トークン・スポットを検証し、DB一意制約で冪等に保存する。
  app.post("/api/stamp", async (c) => {
    const requestStartedAt = monotonicNow();
    const raw = await parseJson(c.req.raw, stampRequestSchema);
    if (!raw) return c.json(jsonError("invalid_request"), 400);
    if (!(await requireDevice(c, raw.device_id))) {
      return c.json(jsonError("unauthorized"), 401);
    }
    const current = now();
    const deviceStampedAt = raw.device_stamped_at ? new Date(raw.device_stamped_at) : null;
    const token = await dependencies.repository.getToken(raw.token);
    const deviceTimeIsInEvent = deviceStampedAt === null || deviceStampedAt <= EVENT_END_AT;
    const isDuringEvent = current <= EVENT_END_AT && deviceTimeIsInEvent;
    const isValidSameDayRetry = token !== undefined
      && current > EVENT_END_AT
      && current < OFFLINE_RESEND_END_AT
      && deviceStampedAt !== null
      && deviceStampedAt >= token.issuedAt
      && deviceStampedAt <= EVENT_END_AT;
    // 仕様5-2/6-7: 16時以降も当日中は、16時までに読み取ったオフライン押印だけを受理する。
    if (!token || (!isDuringEvent && !isValidSameDayRetry)) {
      return c.json(jsonError("invalid_token"), 404);
    }
    const eventId = `evt_${randomUrlSafe(18)}`;
    const result = await dependencies.repository.createStamp({
      token: raw.token,
      deviceId: raw.device_id,
      stampedAt: deviceStampedAt ?? current,
      deviceStampedAt,
      eventId,
    });
    const savedAt = monotonicNow();
    if (!result) return c.json(jsonError("invalid_token"), 404);

    if (result.result === "already" || !result.eventId) {
      // 仕様5-3: 既押印はDBに残らないため、機体とスポットだけをログへ出す。セッションIDはCookieの値なので出さない。
      logger.info("stamp already collected", { deviceId: raw.device_id, spotId: result.spotId, stamp_count: result.stampCount });
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
    const ackWaitStartedAt = monotonicNow();
    const ackWait = ackTracker.wait(result.eventId, config.ackTimeoutMs);
    const subscribers = hub.publishStamped(result.sessionId, stampedEvent);
    const publishedAt = monotonicNow();
    if (subscribers > 0) await dependencies.repository.markDelivered(result.eventId);
    const ackReceived = await ackWait;
    const finishedAt = monotonicNow();
    const delivery = {
      ack_received: ackReceived,
      server_save_ms: Math.max(0, Math.round(savedAt - requestStartedAt)),
      sse_publish_ms: Math.max(0, Math.round(publishedAt - savedAt)),
      ack_wait_ms: Math.max(0, Math.round(finishedAt - ackWaitStartedAt)),
    };
    if (!ackReceived) {
      await dependencies.repository.markAckTimedOut(result.eventId, now());
      logger.warn("stamp ACK timed out", { eventId: result.eventId, deviceId: raw.device_id, ...delivery });
    } else {
      logger.info("stamp ACK received", { eventId: result.eventId, deviceId: raw.device_id, ...delivery });
    }
    return c.json({
      result: "stamped",
      spot_id: result.spotId,
      spot_name: result.spotName,
      stamp_count: result.stampCount,
      total_spots: result.totalSpots,
      completed: result.completed,
      delivery,
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
    // 仕様5-6: DBには最新の受信時刻しか残らないため、受信した内容をログへ出して推移を残す。
    logger.info("device heartbeat", {
      deviceId: raw.device_id,
      uptime_seconds: raw.uptime_seconds,
      last_stamp_count: raw.last_stamp_count,
      pending_queue_count: raw.pending_queue_count,
      battery_level: raw.battery_level ?? null,
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
    const rejection = requireAdmin(c);
    if (rejection) return rejection;
    const devices = await heartbeat.list();
    return c.json({ devices: devices.map((device) => ({
      id: device.id,
      spot_id: device.spotId,
      last_heartbeat_at: device.lastHeartbeatAt?.toISOString() ?? null,
      status: device.status,
      last_stamp_count: device.lastStampCount,
      pending_queue_count: device.pendingQueueCount,
      battery_level: device.batteryLevel,
      ack_timeout_count: device.ackTimeoutCount,
      last_ack_timeout_at: device.lastAckTimeoutAt?.toISOString() ?? null,
    })) });
  });

  app.get("/api/admin/stats", async (c) => {
    const rejection = requireAdmin(c);
    if (rejection) return rejection;
    const [stats, spots] = await Promise.all([
      dependencies.repository.getStats(),
      dependencies.repository.getSpots(),
    ]);
    return c.json({
      participant_count: stats.participantCount,
      stamp_count_by_spot: stats.stampCountBySpot.map((row) => ({ spot_id: row.spotId, count: row.count })),
      completed_count: stats.completedCount,
      sample_spots_active: spots.some((spot) => spot.isSample),
    });
  });

  // 仕様7章: 管理画面で解除した端末だけ、一般開放前も参加者画面を使えるようにする。
  app.post("/api/admin/preview", (c) => {
    const rejection = requireAdmin(c);
    if (rejection) return rejection;
    setCookie(c, PREVIEW_COOKIE, previewCookieValue(config.adminPassword), {
      path: "/",
      httpOnly: true,
      secure: secureCookies,
      sameSite: "Lax",
      expires: EVENT_END_AT,
    });
    const body: AdminPreviewResponse = { ok: true };
    return c.json(body);
  });

  if (staticAssets && staticIndex) {
    // Viteが出力したハッシュ付きassetをそのまま配信する。未解決のSPA画面はindex.htmlへ戻す。
    app.all("/api", (c) => c.json(jsonError("not_found"), 404));
    app.all("/api/*", (c) => c.json(jsonError("not_found"), 404));
    app.use("*", staticAssets);
    app.get("*", (c, next) => staticIndex(c, next));
  }

  return app;
}
