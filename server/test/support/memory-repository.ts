import type {
  HeartbeatState,
  NewSession,
  NewStampInput,
  Repository,
  StampResult,
} from "../../src/db/repository.js";
import type { Device, Session, Spot, Stamp, StampToken } from "../../src/db/schema.js";
import { hashSecret } from "../../src/security.js";

export const memorySpots: Spot[] = [1, 2, 3, 4, 5].map((number) => ({
  id: `spot-${String(number).padStart(2, "0")}`,
  nameJa: `スポット${number}`,
  nameEn: `Spot ${number}`,
  displayOrder: number,
  lat: 34.66,
  lng: 133.91,
  descriptionJa: "案内",
  descriptionEn: "Guide",
  locationNoteJa: null,
  locationNoteEn: null,
  isSample: true,
}));

/** 実DBを使わないAPI/E2E試験用の永続化モデル。 */
export class MemoryRepository implements Repository {
  public readonly sessions = new Map<string, Session>();
  public readonly tokens = new Map<string, StampToken>();
  public readonly stamps: Stamp[] = [];
  public readonly deliveries = new Map<string, { sessionId: string; deviceId: string; acked: boolean; timedOutAt: Date | null }>();
  public readonly devices = new Map<string, Device>([
    ["dev-01", {
      id: "dev-01",
      apiKeyHash: hashSecret("device-key"),
      spotId: "spot-01",
      lastHeartbeatAt: null,
      status: "断",
    }],
    ["dev-02", {
      id: "dev-02",
      apiKeyHash: hashSecret("device-key-02"),
      spotId: "spot-02",
      lastHeartbeatAt: null,
      status: "断",
    }],
  ]);
  public healthy = true;
  private nextStampId = 1;

  public addDevice(id: string, apiKey: string, spotId: string) {
    this.devices.set(id, {
      id,
      apiKeyHash: hashSecret(apiKey),
      spotId,
      lastHeartbeatAt: null,
      status: "断",
    });
  }

  public async createSession(input: NewSession) {
    this.sessions.set(input.id, {
      id: input.id,
      createdAt: input.createdAt,
      userAgent: input.userAgent,
    });
    this.tokens.set(input.token, {
      token: input.token,
      sessionId: input.id,
      issuedAt: input.issuedAt,
    });
  }

  public async getSession(id: string) {
    return this.sessions.get(id);
  }

  public async getToken(token: string) {
    return this.tokens.get(token);
  }

  public async getTokenForSession(sessionId: string) {
    return [...this.tokens.values()].find((token) => token.sessionId === sessionId);
  }

  public async getSpots() {
    return memorySpots;
  }

  public async getStampsForSession(sessionId: string) {
    return this.stamps
      .filter((stamp) => stamp.sessionId === sessionId)
      .sort((left, right) => left.visitOrder - right.visitOrder)
      .map((stamp) => ({ spotId: stamp.spotId, stampedAt: stamp.stampedAt }));
  }

  public async createStamp(input: NewStampInput): Promise<StampResult | undefined> {
    const token = this.tokens.get(input.token);
    const device = this.devices.get(input.deviceId);
    const spot = memorySpots.find((candidate) => candidate.id === device?.spotId);
    if (!token || !device?.spotId || !spot) return undefined;
    const old = this.stamps.find((stamp) =>
      stamp.sessionId === token.sessionId && stamp.spotId === device.spotId,
    );
    const currentCount = this.stamps.filter((stamp) => stamp.sessionId === token.sessionId).length;
    if (old) {
      return {
        result: "already",
        sessionId: token.sessionId,
        stampId: old.id,
        eventId: null,
        spotId: old.spotId,
        spotName: spot.nameJa,
        stampedAt: old.stampedAt,
        stampCount: currentCount,
        totalSpots: memorySpots.length,
        completed: currentCount >= memorySpots.length,
      };
    }
    const stamp: Stamp = {
      id: this.nextStampId++,
      sessionId: token.sessionId,
      spotId: device.spotId,
      stampedAt: input.stampedAt,
      deviceStampedAt: input.deviceStampedAt,
      deviceId: input.deviceId,
      visitOrder: currentCount + 1,
    };
    this.stamps.push(stamp);
    this.deliveries.set(input.eventId, { sessionId: token.sessionId, deviceId: input.deviceId, acked: false, timedOutAt: null });
    return {
      result: "stamped",
      sessionId: token.sessionId,
      stampId: stamp.id,
      eventId: input.eventId,
      spotId: stamp.spotId,
      spotName: spot.nameJa,
      stampedAt: stamp.stampedAt,
      stampCount: currentCount + 1,
      totalSpots: memorySpots.length,
      completed: currentCount + 1 >= memorySpots.length,
    };
  }

  public async markDelivered(_eventId: string) {
    void _eventId;
  }

  public async markAckTimedOut(eventId: string, timedOutAt: Date) {
    const delivery = this.deliveries.get(eventId);
    if (delivery) delivery.timedOutAt = timedOutAt;
  }

  public async ackEvent(eventId: string, sessionId: string) {
    const delivery = this.deliveries.get(eventId);
    if (!delivery || delivery.sessionId !== sessionId || delivery.acked) return false;
    delivery.acked = true;
    return true;
  }

  public async healthCheck() {
    if (!this.healthy) throw new Error("database unavailable");
  }

  public async getDevice(deviceId: string) {
    return this.devices.get(deviceId);
  }

  public async updateHeartbeat(state: HeartbeatState) {
    const device = this.devices.get(state.deviceId);
    if (device) {
      device.lastHeartbeatAt = state.receivedAt;
      device.status = "正常";
    }
  }

  public async listDevices() {
    return [...this.devices.values()];
  }

  public async getAckTimeoutsByDevice(since: Date) {
    return [...this.devices.values()].flatMap((device) => {
      const timedOut = [...this.deliveries.values()].filter((delivery) =>
        delivery.timedOutAt && delivery.timedOutAt >= since
        && delivery.deviceId === device.id);
      const lastTimedOutAt = timedOut.reduce<Date | null>((latest, delivery) =>
        !latest || (delivery.timedOutAt && delivery.timedOutAt > latest) ? delivery.timedOutAt : latest, null);
      return lastTimedOutAt ? [{ deviceId: device.id, count: timedOut.length, lastTimedOutAt }] : [];
    });
  }

  public async getStats(openAt: Date) {
    const participants = [...this.sessions.values()].filter((session) => session.createdAt >= openAt).map((session) => session.id);
    const eventStamps = this.stamps.filter((stamp) => participants.includes(stamp.sessionId));
    return {
      participantCount: participants.length,
      stampCountBySpot: memorySpots.map((spot) => ({
        spotId: spot.id,
        count: eventStamps.filter((stamp) => stamp.spotId === spot.id).length,
      })),
      completedCount: participants.filter((id) =>
        new Set(eventStamps.filter((stamp) => stamp.sessionId === id).map((stamp) => stamp.spotId)).size === memorySpots.length,
      ).length,
    };
  }
}
