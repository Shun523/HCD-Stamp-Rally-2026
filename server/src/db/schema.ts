import {
  boolean,
  integer,
  real,
  serial,
  text,
  timestamp,
  unique,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";

const timestampWithTimezone = (name: string) => timestamp(name, {
  withTimezone: true,
  mode: "date",
});

// 仕様8章: sessions（参加者）
export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
  userAgent: text("user_agent").notNull().default(""),
});

// 仕様8章・5-2: 押印トークンは sessions と独立したテーブルで管理する。
export const stampTokens = pgTable("stamp_tokens", {
  token: varchar("token", { length: 64 }).primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().references(() => sessions.id, { onDelete: "cascade" }),
  issuedAt: timestampWithTimezone("issued_at").notNull().defaultNow(),
});

// 仕様8章・4-6: サンプルデータはシードファイルで差し替える。
export const spots = pgTable("spots", {
  id: varchar("id", { length: 32 }).primaryKey(),
  nameJa: text("name_ja").notNull(),
  nameEn: text("name_en").notNull(),
  displayOrder: integer("display_order").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  descriptionJa: text("description_ja").notNull(),
  descriptionEn: text("description_en").notNull(),
  locationNoteJa: text("location_note_ja"),
  locationNoteEn: text("location_note_en"),
  isSample: boolean("is_sample").notNull().default(true),
});

// 仕様8章・5-3: session_id × spot_id はDB側でも一意にする。
export const stamps = pgTable("stamps", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().references(() => sessions.id, { onDelete: "cascade" }),
  spotId: varchar("spot_id", { length: 32 }).notNull().references(() => spots.id),
  stampedAt: timestampWithTimezone("stamped_at").notNull(),
  deviceStampedAt: timestampWithTimezone("device_stamped_at"),
  deviceId: varchar("device_id", { length: 64 }).notNull(),
  visitOrder: integer("visit_order").notNull(),
}, (table) => ({
  sessionSpotUnique: unique("stamps_session_id_spot_id_unique").on(table.sessionId, table.spotId),
}));

// 仕様8章・5-4: SSEイベントの配信とACKを記録する。
export const deliveries = pgTable("deliveries", {
  eventId: varchar("event_id", { length: 64 }).primaryKey(),
  stampId: integer("stamp_id").notNull().references(() => stamps.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 64 }).notNull().references(() => sessions.id, { onDelete: "cascade" }),
  deliveredAt: timestampWithTimezone("delivered_at"),
  ackedAt: timestampWithTimezone("acked_at"),
  ackTimedOutAt: timestampWithTimezone("ack_timed_out_at"),
  result: varchar("result", { length: 32 }).notNull().default("pending"),
});

// 仕様8章・5-5/5-6: 機体とAPIキーのハッシュを管理する。
export const devices = pgTable("devices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  apiKeyHash: varchar("api_key_hash", { length: 128 }).notNull(),
  spotId: varchar("spot_id", { length: 32 }).references(() => spots.id),
  lastHeartbeatAt: timestampWithTimezone("last_heartbeat_at"),
  status: varchar("status", { length: 16 }).notNull().default("断"),
});

export type Session = typeof sessions.$inferSelect;
export type StampToken = typeof stampTokens.$inferSelect;
export type Spot = typeof spots.$inferSelect;
export type Stamp = typeof stamps.$inferSelect;
export type Device = typeof devices.$inferSelect;
