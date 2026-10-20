import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });
// 仕様8章・9章: 受け取る識別子はDBカラムの上限64文字に収める。
const requestIdentifier = z.string().min(1).max(64);

export const apiErrorResponseSchema = z.object({ error: z.string() });

export const spotSchema = z.object({
  id: z.string(),
  name_ja: z.string(),
  name_en: z.string(),
  display_order: z.number().int(),
  lat: z.number(),
  lng: z.number(),
  description_ja: z.string(),
  description_en: z.string(),
  location_note_ja: z.string().nullable(),
  location_note_en: z.string().nullable(),
  is_sample: z.boolean(),
});

export const meResponseSchema = z.object({
  token: z.string(),
  token_expires_at: isoTimestamp,
  stamps: z.array(z.object({
    spot_id: z.string(),
    stamped_at: isoTimestamp,
  })),
  completed: z.boolean(),
});

export const spotsResponseSchema = z.object({
  spots: z.array(spotSchema),
});

export const stampRequestSchema = z.object({
  token: requestIdentifier,
  device_id: requestIdentifier,
  device_stamped_at: isoTimestamp.max(64).optional(),
});

export const stampResponseSchema = z.object({
  result: z.enum(["stamped", "already"]),
  spot_id: z.string(),
  spot_name: z.string(),
  stamp_count: z.number().int().nonnegative(),
  total_spots: z.number().int().positive(),
  completed: z.boolean(),
  event_id: z.string().optional(),
  delivery: z.object({
    ack_received: z.boolean(),
    server_save_ms: z.number().nonnegative(),
    sse_publish_ms: z.number().nonnegative(),
    ack_wait_ms: z.number().nonnegative(),
  }).optional(),
});

export const ackRequestSchema = z.object({
  event_id: requestIdentifier,
});

export const heartbeatRequestSchema = z.object({
  device_id: requestIdentifier,
  uptime_seconds: z.number().nonnegative(),
  last_stamp_count: z.number().int().nonnegative(),
  pending_queue_count: z.number().int().nonnegative(),
  battery_level: z.number().min(0).max(100).nullable().optional(),
});

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  db: z.literal("ok"),
});

export const deviceStatusSchema = z.object({
  id: z.string(),
  spot_id: z.string().nullable(),
  last_heartbeat_at: isoTimestamp.nullable(),
  status: z.enum(["正常", "警告", "断"]),
  last_stamp_count: z.number().int().nonnegative(),
  pending_queue_count: z.number().int().nonnegative(),
  battery_level: z.number().nullable(),
  ack_timeout_count: z.number().int().nonnegative(),
  last_ack_timeout_at: isoTimestamp.nullable(),
});

export const adminDevicesResponseSchema = z.object({
  devices: z.array(deviceStatusSchema),
});

export const adminStatsResponseSchema = z.object({
  participant_count: z.number().int().nonnegative(),
  stamp_count_by_spot: z.array(z.object({
    spot_id: z.string(),
    count: z.number().int().nonnegative(),
  })),
  completed_count: z.number().int().nonnegative(),
  sample_spots_active: z.boolean(),
});

// 仕様4-8・9章: 一般開放の状態。判定はサーバー時刻で行い、待機画面の待ち時間にも使う。
export const statusResponseSchema = z.object({
  open: z.boolean(),
  opens_at: isoTimestamp,
  server_time: isoTimestamp,
});

// 仕様7章・9章: 開始前の解除Cookieを渡したことだけを返す。
export const adminPreviewResponseSchema = z.object({ ok: z.literal(true) });

export const stampedEventSchema = z.object({
  event_id: z.string(),
  spot_id: z.string(),
  stamped_at: isoTimestamp,
  stamp_count: z.number().int().nonnegative(),
  total_spots: z.number().int().positive(),
  completed: z.boolean(),
});

export type Spot = z.infer<typeof spotSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type StampRequest = z.infer<typeof stampRequestSchema>;
export type StampResponse = z.infer<typeof stampResponseSchema>;
export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>;
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
export type AdminDevicesResponse = z.infer<typeof adminDevicesResponseSchema>;
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type AdminPreviewResponse = z.infer<typeof adminPreviewResponseSchema>;
export type StampedEvent = z.infer<typeof stampedEventSchema>;
