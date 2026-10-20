import { fileURLToPath } from "node:url";

// 仕様4-8: 一般開放は稼働開始（Q-01）と同じ10月31日10:00。それまでは待機画面だけを出す。
export const PARTICIPANT_OPEN_AT = new Date("2026-10-31T10:00:00+09:00");
export const EVENT_END_AT = new Date("2026-10-31T16:00:00+09:00");
// 仕様5-2/6-7: 16時までに端末へ保存された押印は10月31日中だけ再送を受け付ける。
export const OFFLINE_RESEND_END_AT = new Date("2026-11-01T00:00:00+09:00");
export const SESSION_COOKIE_EXPIRES_AT = new Date("2026-11-30T23:59:59+09:00");
export const HEARTBEAT_WARNING_AFTER_MS = 60_000;
export const HEARTBEAT_DISCONNECTED_AFTER_MS = 90_000;
export const SSE_PING_INTERVAL_MS = 15_000;
export const DEFAULT_ACK_TIMEOUT_MS = 3_000;

export type SecurityLimits = {
  adminMaxFailures: number;
  adminFailureWindowMs: number;
  sessionMaxNewPerSource: number;
  sessionMaxNewTotal: number;
  sessionCreationWindowMs: number;
  sseMaxPerSession: number;
  sseMaxTotal: number;
  maxRequestBodyBytes: number;
};

// 仕様11章: 過剰アクセスを制限する。初期値は2026-10-14の利用者指定（緩めの案）。
export const DEFAULT_SECURITY_LIMITS: Readonly<SecurityLimits> = Object.freeze({
  adminMaxFailures: 20,
  adminFailureWindowMs: 10 * 60_000,
  sessionMaxNewPerSource: 240,
  sessionMaxNewTotal: 600,
  sessionCreationWindowMs: 60_000,
  sseMaxPerSession: 6,
  sseMaxTotal: 1_200,
  maxRequestBodyBytes: 8 * 1_024,
});

const integerSetting = (env: NodeJS.ProcessEnv, name: string, fallback: number, minimum = 1): number => {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
};

// 仕様4-8: 開放時刻の上書きはローカル開発と自動テスト用。時差の取り違えを防ぐため、時差付きのISO 8601だけを受け付ける。
const isoDateTimeWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const dateSetting = (env: NodeJS.ProcessEnv, name: string, fallback: Date): Date => {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = new Date(raw);
  if (!isoDateTimeWithOffset.test(raw) || Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be an ISO 8601 date-time with a UTC offset`);
  }
  return value;
};

export type ServerConfig = {
  databaseUrl: string;
  databaseSslCa?: string;
  port: number;
  adminPassword: string;
  ackTimeoutMs: number;
  webDistDir: string;
  securityLimits: SecurityLimits;
  trustedProxyHops: number;
  participantOpenAt: Date;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    databaseSslCa: env.DATABASE_SSL_CA?.replace(/\\n/g, "\n") || undefined,
    port: Number(env.PORT ?? 8787),
    adminPassword: env.ADMIN_PASSWORD ?? "",
    ackTimeoutMs: Number(env.ACK_TIMEOUT_MS ?? DEFAULT_ACK_TIMEOUT_MS),
    // 仕様2章: Webのビルド成果物はサーバーと同じオリジンから配信する。
    // pnpm --filter はcwdをserver/へ変えるため、モジュール位置基準でweb/distを解決する。
    webDistDir: env.WEB_DIST_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
    securityLimits: {
      adminMaxFailures: integerSetting(env, "ADMIN_MAX_FAILURES", DEFAULT_SECURITY_LIMITS.adminMaxFailures),
      adminFailureWindowMs: integerSetting(env, "ADMIN_FAILURE_WINDOW_MS", DEFAULT_SECURITY_LIMITS.adminFailureWindowMs),
      sessionMaxNewPerSource: integerSetting(env, "SESSION_MAX_NEW_PER_SOURCE", DEFAULT_SECURITY_LIMITS.sessionMaxNewPerSource),
      sessionMaxNewTotal: integerSetting(env, "SESSION_MAX_NEW_TOTAL", DEFAULT_SECURITY_LIMITS.sessionMaxNewTotal),
      sessionCreationWindowMs: integerSetting(env, "SESSION_CREATION_WINDOW_MS", DEFAULT_SECURITY_LIMITS.sessionCreationWindowMs),
      sseMaxPerSession: integerSetting(env, "SSE_MAX_CONNECTIONS_PER_SESSION", DEFAULT_SECURITY_LIMITS.sseMaxPerSession),
      sseMaxTotal: integerSetting(env, "SSE_MAX_CONNECTIONS_TOTAL", DEFAULT_SECURITY_LIMITS.sseMaxTotal),
      maxRequestBodyBytes: integerSetting(env, "MAX_REQUEST_BODY_BYTES", DEFAULT_SECURITY_LIMITS.maxRequestBodyBytes),
    },
    // 現在の直接run.app URLはCloud Runの1段のプロキシを信頼する。ローカルではヘッダーを信頼しない。
    trustedProxyHops: integerSetting(env, "TRUSTED_PROXY_HOPS", env.K_SERVICE ? 1 : 0, 0),
    participantOpenAt: dateSetting(env, "PARTICIPANT_OPEN_AT", PARTICIPANT_OPEN_AT),
  };
}
