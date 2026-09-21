import {
  HEARTBEAT_DISCONNECTED_AFTER_MS,
  HEARTBEAT_WARNING_AFTER_MS,
} from "./config.js";
import type { Repository } from "./db/repository.js";

export type HeartbeatMemory = {
  receivedAt: Date;
  lastStampCount: number;
  pendingQueueCount: number;
  batteryLevel: number | null;
};

const JAPAN_OFFSET_MS = 9 * 60 * 60 * 1_000;

function startOfJapanDay(value: Date): Date {
  const shifted = new Date(value.getTime() + JAPAN_OFFSET_MS);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - JAPAN_OFFSET_MS);
}

export class HeartbeatMonitor {
  private readonly memory = new Map<string, HeartbeatMemory>();

  public constructor(
    private readonly repository: Repository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async record(input: {
    deviceId: string;
    lastStampCount: number;
    pendingQueueCount: number;
    batteryLevel: number | null;
  }): Promise<void> {
    const receivedAt = this.now();
    this.memory.set(input.deviceId, {
      receivedAt,
      lastStampCount: input.lastStampCount,
      pendingQueueCount: input.pendingQueueCount,
      batteryLevel: input.batteryLevel,
    });
    await this.repository.updateHeartbeat({
      deviceId: input.deviceId,
      receivedAt,
      lastStampCount: input.lastStampCount,
      pendingQueueCount: input.pendingQueueCount,
      batteryLevel: input.batteryLevel,
    });
  }

  public async list() {
    const current = this.now();
    const [dbDevices, ackTimeouts] = await Promise.all([
      this.repository.listDevices(),
      this.repository.getAckTimeoutsByDevice(startOfJapanDay(current)),
    ]);
    const ackTimeoutByDevice = new Map(ackTimeouts.map((summary) => [summary.deviceId, summary]));
    const now = current.getTime();
    return dbDevices.map((device) => {
      const memory = this.memory.get(device.id);
      const ackTimeout = ackTimeoutByDevice.get(device.id);
      const lastHeartbeatAt = memory?.receivedAt ?? device.lastHeartbeatAt ?? null;
      const age = lastHeartbeatAt ? now - lastHeartbeatAt.getTime() : Number.POSITIVE_INFINITY;
      const status = age > HEARTBEAT_DISCONNECTED_AFTER_MS
        ? "断"
        : age > HEARTBEAT_WARNING_AFTER_MS ? "警告" : "正常";
      return {
        id: device.id,
        spotId: device.spotId,
        lastHeartbeatAt,
        status,
        lastStampCount: memory?.lastStampCount ?? 0,
        pendingQueueCount: memory?.pendingQueueCount ?? 0,
        batteryLevel: memory?.batteryLevel ?? null,
        ackTimeoutCount: ackTimeout?.count ?? 0,
        lastAckTimeoutAt: ackTimeout?.lastTimedOutAt ?? null,
      };
    });
  }
}
