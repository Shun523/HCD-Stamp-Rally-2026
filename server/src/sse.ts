import type { StampedEvent } from "@hcd-stamp-rally/shared";

export type ServerEvent = {
  id?: string;
  event: "stamped" | "ping";
  data: string;
};

type Subscriber = (event: ServerEvent) => void;

export class SseHub {
  private readonly channels = new Map<string, Set<Subscriber>>();

  public subscribe(sessionId: string, subscriber: Subscriber): () => void {
    const channel = this.channels.get(sessionId) ?? new Set<Subscriber>();
    channel.add(subscriber);
    this.channels.set(sessionId, channel);
    return () => {
      channel.delete(subscriber);
      if (channel.size === 0) this.channels.delete(sessionId);
    };
  }

  public publish(sessionId: string, event: ServerEvent): number {
    const channel = this.channels.get(sessionId);
    if (!channel) return 0;
    for (const subscriber of channel) subscriber(event);
    return channel.size;
  }

  public publishStamped(sessionId: string, event: StampedEvent): number {
    return this.publish(sessionId, {
      id: event.event_id,
      event: "stamped",
      data: JSON.stringify(event),
    });
  }

  public connectionCount(sessionId: string): number {
    return this.channels.get(sessionId)?.size ?? 0;
  }
}

export class AckTracker {
  private readonly waiters = new Map<string, (acked: boolean) => void>();

  public wait(eventId: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(eventId);
        resolve(false);
      }, timeoutMs);
      this.waiters.set(eventId, (acked) => {
        clearTimeout(timer);
        this.waiters.delete(eventId);
        resolve(acked);
      });
    });
  }

  public resolve(eventId: string, acked: boolean): void {
    this.waiters.get(eventId)?.(acked);
  }
}
