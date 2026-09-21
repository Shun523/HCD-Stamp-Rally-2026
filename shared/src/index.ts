import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });

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
  token: z.string().min(1),
  device_id: z.string().min(1),
  device_stamped_at: isoTimestamp.optional(),
});

export const stampResponseSchema = z.object({
  result: z.enum(["stamped", "already"]),
  spot_id: z.string(),
  spot_name: z.string(),
  stamp_count: z.number().int().nonnegative(),
  total_spots: z.number().int().positive(),
  completed: z.boolean(),
  event_id: z.string().optional(),
});

export const ackRequestSchema = z.object({
  event_id: z.string().min(1),
});

export const heartbeatRequestSchema = z.object({
  device_id: z.string().min(1),
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
});

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
export type StampedEvent = z.infer<typeof stampedEventSchema>;
