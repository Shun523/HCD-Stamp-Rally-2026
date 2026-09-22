import {
  ackRequestSchema,
  adminDevicesResponseSchema,
  adminStatsResponseSchema,
  meResponseSchema,
  spotsResponseSchema,
} from "@hcd-stamp-rally/shared";
import type { AdminDevicesResponse, AdminStatsResponse } from "@hcd-stamp-rally/shared";

export class ApiError extends Error {
  public constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type Fetcher = typeof fetch;

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request(fetcher: Fetcher, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetcher(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) throw new ApiError(response.status, `Request failed: ${response.status}`);
  return response;
}

export function createParticipantApi(fetcher: Fetcher = fetch) {
  return {
    async getMe() {
      const response = await request(fetcher, "/api/me");
      return meResponseSchema.parse(await response.json());
    },
    async getSpots() {
      const response = await request(fetcher, "/api/spots");
      return spotsResponseSchema.parse(await response.json());
    },
    async acknowledge(eventId: string) {
      const body = ackRequestSchema.parse({ event_id: eventId });
      await request(fetcher, "/api/ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}

export function createAdminApi(password: string, fetcher: Fetcher = fetch) {
  const headers = { "x-admin-password": password };
  return {
    async getDevices(): Promise<AdminDevicesResponse> {
      const response = await request(fetcher, "/api/admin/devices", { headers });
      return adminDevicesResponseSchema.parse(await response.json());
    },
    async getStats(): Promise<AdminStatsResponse> {
      const response = await request(fetcher, "/api/admin/stats", { headers });
      return adminStatsResponseSchema.parse(await response.json());
    },
  };
}
