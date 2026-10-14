import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const address = value.trim();
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return undefined;
  try {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    // IPv4-mapped IPv6と通常のIPv4を同じ接続元として扱う。
    if (normalized.startsWith("::ffff:")) {
      const parts = normalized.slice(7).split(":");
      if (parts.length === 2) {
        const high = Number.parseInt(parts[0]!, 16);
        const low = Number.parseInt(parts[1]!, 16);
        return [high >> 8, high & 255, low >> 8, low & 255].join(".");
      }
    }
    return normalized;
  } catch {
    return undefined;
  }
}

// 仕様11章: 任意に送れるヘッダーの先頭で回数制限を回避させない。
export function clientAddress(c: Context, trustedProxyHops: number): string {
  let peer: string | undefined;
  try {
    peer = normalizeAddress(getConnInfo(c).remote.address);
  } catch {
    // app.requestによるメモリ内の試験等は実ソケットを持たない。同じunknown枠で制限する。
  }
  if (peer && trustedProxyHops > 0) {
    const chain = c.req.header("x-forwarded-for")?.split(",") ?? [];
    const address = normalizeAddress(chain.at(-trustedProxyHops));
    if (address) return address;
  }
  return peer ?? "unknown";
}
