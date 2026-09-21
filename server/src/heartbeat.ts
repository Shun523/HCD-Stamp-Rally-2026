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
    const dbDevices = await this.repository.listDevices();
    const now = this.now().getTime();
    return dbDevices.map((device) => {
      const memory = this.memory.get(device.id);
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
      };
    });
  }
}
