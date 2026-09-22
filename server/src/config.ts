import { fileURLToPath } from "node:url";

export const EVENT_END_AT = new Date("2026-10-31T16:00:00+09:00");
// 仕様5-2/6-7: 16時までに端末へ保存された押印は10月31日中だけ再送を受け付ける。
export const OFFLINE_RESEND_END_AT = new Date("2026-11-01T00:00:00+09:00");
export const SESSION_COOKIE_EXPIRES_AT = new Date("2026-11-30T23:59:59+09:00");
export const HEARTBEAT_WARNING_AFTER_MS = 60_000;
export const HEARTBEAT_DISCONNECTED_AFTER_MS = 90_000;
export const SSE_PING_INTERVAL_MS = 15_000;
export const DEFAULT_ACK_TIMEOUT_MS = 3_000;

export type ServerConfig = {
  databaseUrl: string;
  port: number;
  adminPassword: string;
  ackTimeoutMs: number;
  webDistDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    port: Number(env.PORT ?? 8787),
    adminPassword: env.ADMIN_PASSWORD ?? "",
    ackTimeoutMs: Number(env.ACK_TIMEOUT_MS ?? DEFAULT_ACK_TIMEOUT_MS),
    // 仕様2章: Webのビルド成果物はサーバーと同じオリジンから配信する。
    // pnpm --filter はcwdをserver/へ変えるため、モジュール位置基準でweb/distを解決する。
    webDistDir: env.WEB_DIST_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
  };
}
