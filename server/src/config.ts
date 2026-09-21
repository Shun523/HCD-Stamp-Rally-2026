export const EVENT_END_AT = new Date("2026-10-31T16:00:00+09:00");
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
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    port: Number(env.PORT ?? 8787),
    adminPassword: env.ADMIN_PASSWORD ?? "",
    ackTimeoutMs: Number(env.ACK_TIMEOUT_MS ?? DEFAULT_ACK_TIMEOUT_MS),
  };
}
