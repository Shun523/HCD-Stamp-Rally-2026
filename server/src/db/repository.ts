import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "./client.js";
import {
  deliveries,
  devices,
  sessions,
  spots,
  stampTokens,
  stamps,
} from "./schema.js";

export type NewSession = {
  id: string;
  token: string;
  userAgent: string;
  createdAt: Date;
  issuedAt: Date;
};

export type NewStampInput = {
  token: string;
  deviceId: string;
  stampedAt: Date;
  deviceStampedAt: Date | null;
  eventId: string;
};

export type StampResult = {
  result: "stamped" | "already";
  sessionId: string;
  stampId: number | null;
  eventId: string | null;
  spotId: string;
  spotName: string;
  stampedAt: Date;
  stampCount: number;
  totalSpots: number;
  completed: boolean;
};

export type HeartbeatState = {
  deviceId: string;
  receivedAt: Date;
  lastStampCount: number;
  pendingQueueCount: number;
  batteryLevel: number | null;
};

export interface Repository {
  createSession(input: NewSession): Promise<void>;
  getSession(id: string): Promise<typeof sessions.$inferSelect | undefined>;
  getToken(token: string): Promise<typeof stampTokens.$inferSelect | undefined>;
  getTokenForSession(sessionId: string): Promise<typeof stampTokens.$inferSelect | undefined>;
  getSpots(): Promise<typeof spots.$inferSelect[]>;
  getStampsForSession(sessionId: string): Promise<Array<{ spotId: string; stampedAt: Date }>>;
  createStamp(input: NewStampInput): Promise<StampResult | undefined>;
  markDelivered(eventId: string): Promise<void>;
  ackEvent(eventId: string, sessionId: string): Promise<boolean>;
  healthCheck(): Promise<void>;
  getDevice(deviceId: string): Promise<typeof devices.$inferSelect | undefined>;
  updateHeartbeat(state: HeartbeatState): Promise<void>;
  listDevices(): Promise<typeof devices.$inferSelect[]>;
  getStats(): Promise<{
    participantCount: number;
    stampCountBySpot: Array<{ spotId: string; count: number }>;
    completedCount: number;
  }>;
}

export class PostgresRepository implements Repository {
  public constructor(private readonly db: AppDb) {}

  public async createSession(input: NewSession): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(sessions).values({
        id: input.id,
        createdAt: input.createdAt,
        userAgent: input.userAgent,
      });
      await tx.insert(stampTokens).values({
        token: input.token,
        sessionId: input.id,
        issuedAt: input.issuedAt,
      });
    });
  }

  public async getSession(id: string) {
    return this.db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  }

  public async getToken(token: string) {
    return this.db.query.stampTokens.findFirst({ where: eq(stampTokens.token, token) });
  }

  public async getTokenForSession(sessionId: string) {
    return this.db.query.stampTokens.findFirst({ where: eq(stampTokens.sessionId, sessionId) });
  }

  public async getSpots() {
    return this.db.select().from(spots).orderBy(asc(spots.displayOrder));
  }

  public async getStampsForSession(sessionId: string) {
    const rows = await this.db
      .select({ spotId: stamps.spotId, stampedAt: stamps.stampedAt })
      .from(stamps)
      .where(eq(stamps.sessionId, sessionId))
      .orderBy(asc(stamps.visitOrder));
    return rows;
  }

  public async createStamp(input: NewStampInput): Promise<StampResult | undefined> {
    return this.db.transaction(async (tx) => {
      const tokenRow = await tx.query.stampTokens.findFirst({
        where: eq(stampTokens.token, input.token),
      });
      if (!tokenRow) return undefined;

      const device = await tx.query.devices.findFirst({
        where: eq(devices.id, input.deviceId),
      });
      if (!device?.spotId) return undefined;
      const spotRowDirect = await tx.query.spots.findFirst({
        where: eq(spots.id, device.spotId),
      });
      if (!spotRowDirect) return undefined;

      const orderRows = await tx
        .select({ count: count() })
        .from(stamps)
        .where(eq(stamps.sessionId, tokenRow.sessionId));
      const visitOrder = Number(orderRows[0]?.count ?? 0) + 1;
      const inserted = await tx
        .insert(stamps)
        .values({
          sessionId: tokenRow.sessionId,
          spotId: device.spotId,
          stampedAt: input.stampedAt,
          deviceStampedAt: input.deviceStampedAt,
          deviceId: input.deviceId,
          visitOrder,
        })
        .onConflictDoNothing({ target: [stamps.sessionId, stamps.spotId] })
        .returning({ id: stamps.id, stampedAt: stamps.stampedAt });

      const totalSpotsRows = await tx.select({ count: count() }).from(spots);
      const stampCountRows = await tx
        .select({ count: count() })
        .from(stamps)
        .where(eq(stamps.sessionId, tokenRow.sessionId));
      const stampCount = Number(stampCountRows[0]?.count ?? 0);
      const totalSpots = Number(totalSpotsRows[0]?.count ?? 0);
      const existing = inserted[0];
      if (!existing) {
        const oldStamp = await tx.query.stamps.findFirst({
          where: and(eq(stamps.sessionId, tokenRow.sessionId), eq(stamps.spotId, device.spotId)),
        });
        return {
          result: "already",
          sessionId: tokenRow.sessionId,
          stampId: oldStamp?.id ?? null,
          eventId: null,
          spotId: device.spotId,
          spotName: spotRowDirect.nameJa,
          stampedAt: oldStamp?.stampedAt ?? input.stampedAt,
          stampCount,
          totalSpots,
          completed: totalSpots > 0 && stampCount >= totalSpots,
        };
      }

      await tx.insert(deliveries).values({
        eventId: input.eventId,
        stampId: existing.id,
        sessionId: tokenRow.sessionId,
        result: "pending",
      });
      return {
        result: "stamped",
        sessionId: tokenRow.sessionId,
        stampId: existing.id,
        eventId: input.eventId,
        spotId: device.spotId,
        spotName: spotRowDirect.nameJa,
        stampedAt: existing.stampedAt,
        stampCount,
        totalSpots,
        completed: totalSpots > 0 && stampCount >= totalSpots,
      };
    });
  }

  public async markDelivered(eventId: string): Promise<void> {
    await this.db.update(deliveries).set({
      deliveredAt: new Date(),
      result: "delivered",
    }).where(eq(deliveries.eventId, eventId));
  }

  public async ackEvent(eventId: string, sessionId: string): Promise<boolean> {
    const rows = await this.db.update(deliveries).set({
      ackedAt: new Date(),
      result: "acked",
    }).where(and(
      eq(deliveries.eventId, eventId),
      eq(deliveries.sessionId, sessionId),
      isNull(deliveries.ackedAt),
    )).returning({ eventId: deliveries.eventId });
    return rows.length > 0;
  }

  public async healthCheck(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  public async getDevice(deviceId: string) {
    return this.db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
  }

  public async updateHeartbeat(state: HeartbeatState): Promise<void> {
    await this.db.update(devices).set({
      lastHeartbeatAt: state.receivedAt,
      status: "正常",
    }).where(eq(devices.id, state.deviceId));
  }

  public async listDevices() {
    return this.db.select().from(devices).orderBy(asc(devices.id));
  }

  public async getStats() {
    const participants = await this.db.select({ count: count() }).from(sessions);
    const bySpot = await this.db
      .select({ spotId: spots.id, count: count(stamps.id) })
      .from(spots)
      .leftJoin(stamps, eq(stamps.spotId, spots.id))
      .groupBy(spots.id)
      .orderBy(asc(spots.displayOrder));
    const completed = await this.db.execute<{ count: string }>(sql`
      select count(*)::text as count
      from (
        select session_id
        from stamps
        group by session_id
        having count(distinct spot_id) = (select count(*) from spots)
      ) completed_sessions
    `);
    return {
      participantCount: Number(participants[0]?.count ?? 0),
      stampCountBySpot: bySpot.map((row) => ({ spotId: row.spotId, count: Number(row.count) })),
      completedCount: Number(completed[0]?.count ?? 0),
    };
  }
}
