import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientAddress } from "../src/client-address.js";

async function resolveAddress(peer: string | undefined, forwarded: string | undefined, trustedHops: number) {
  const app = new Hono();
  app.get("/", (c) => c.text(clientAddress(c, trustedHops)));
  const response = await app.request("/", { headers: forwarded ? { "x-forwarded-for": forwarded } : {} },
    peer ? { incoming: { socket: { remoteAddress: peer } } } : undefined);
  return response.text();
}

describe("trusted client addresses", () => {
  it("ignores caller-supplied forwarding headers on a direct connection", async () => {
    expect(await resolveAddress("192.0.2.1", "198.51.100.1", 0)).toBe("192.0.2.1");
  });

  it("uses the configured hop from the right rather than the spoofable first address", async () => {
    expect(await resolveAddress("169.254.1.1", "203.0.113.123, 192.0.2.1", 1)).toBe("192.0.2.1");
    expect(await resolveAddress("169.254.1.1", "203.0.113.234, 192.0.2.1", 1)).toBe("192.0.2.1");
    expect(await resolveAddress("169.254.1.1", "203.0.113.123, 192.0.2.1, 198.51.100.1", 2)).toBe("192.0.2.1");
  });

  it("falls back safely when the trusted entry is invalid or the socket is unavailable", async () => {
    expect(await resolveAddress("169.254.1.1", "192.0.2.1, invalid", 1)).toBe("169.254.1.1");
    expect(await resolveAddress(undefined, "192.0.2.1", 1)).toBe("unknown");
  });

  it("normalizes IPv6 aliases and IPv4-mapped IPv6", async () => {
    expect(await resolveAddress("2001:db8:0:0:0:0:0:1", undefined, 0)).toBe("2001:db8::1");
    expect(await resolveAddress("::ffff:192.0.2.1", undefined, 0)).toBe("192.0.2.1");
  });
});
