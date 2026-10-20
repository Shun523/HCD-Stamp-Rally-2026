import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "hcd_session";
export const PREVIEW_COOKIE = "hcd_preview";

// 仕様7章: 開始前の解除Cookieは共有パスワードを鍵にしたHMAC。サーバーに状態を持たず、パスワードを変えると無効になる。
export const previewCookieValue = (adminPassword: string): string =>
  createHmac("sha256", adminPassword).update("participant-preview-v1").digest("base64url");

export const randomUrlSafe = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const hashSecret = (secret: string): string => createHash("sha256").update(secret).digest("hex");

export function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readDeviceApiKey(authorization: string | undefined, headerKey: string | undefined): string | undefined {
  if (headerKey) return headerKey;
  if (!authorization) return undefined;
  const match = /^(?:Bearer|ApiKey)\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? authorization;
}

export function readAdminPassword(request: Request): string | undefined {
  const explicit = request.headers.get("x-admin-password");
  if (explicit) return explicit;
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);
  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
      return decoded.slice(decoded.indexOf(":") + 1);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
