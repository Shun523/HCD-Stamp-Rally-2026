import { afterEach, describe, expect, it, vi } from "vitest";
import type { StampedEvent } from "@hcd-stamp-rally/shared";
import { RealtimeClient, type EventSourceLike } from "../src/realtime.js";
import { shouldShowStampAnimation } from "../src/stamp-events.js";

class FakeEventSource implements EventSourceLike {
  public onerror: ((event: Event) => void) | null = null;
  public onopen: ((event: Event) => void) | null = null;
  public closed = false;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  public close = () => { this.closed = true; };
  public addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  public open() { this.onopen?.(new Event("open")); }
  public fail() { this.onerror?.(new Event("error")); }
  public emitStamped(event: StampedEvent) {
    const message = new MessageEvent<string>("stamped", { data: JSON.stringify(event) });
    this.listeners.get("stamped")?.forEach((listener) => listener(message));
  }
}

const event: StampedEvent = {
  event_id: "evt_01HXY",
  spot_id: "spot-01",
  stamped_at: "2026-10-31T04:24:05.000Z",
  stamp_count: 1,
  total_spots: 5,
  completed: false,
};

afterEach(() => vi.useRealTimers());

describe("RealtimeClient", () => {
  it("reconnects with an exponential backoff capped at five seconds and refetches state", () => {
    vi.useFakeTimers();
    const sources: FakeEventSource[] = [];
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = new RealtimeClient({
      refresh,
      acknowledge: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onStamped: vi.fn(),
      eventSourceFactory: () => { const source = new FakeEventSource(); sources.push(source); return source; },
      document,
      initialReconnectDelayMs: 100,
      maxReconnectDelayMs: 5_000,
    });
    client.start();
    sources[0]?.fail();
    expect(sources[0]?.closed).toBe(true);
    vi.advanceTimersByTime(99);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    sources[1]?.fail();
    vi.advanceTimersByTime(199);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3);
    client.stop();
  });

  it("refetches when the page becomes visible", () => {
    vi.useFakeTimers();
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = new RealtimeClient({
      refresh,
      acknowledge: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onStamped: vi.fn(),
      eventSourceFactory: () => new FakeEventSource(),
      document,
    });
    client.start();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it("polls /api/me state every ten seconds regardless of SSE state", () => {
    vi.useFakeTimers();
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = new RealtimeClient({
      refresh,
      acknowledge: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onStamped: vi.fn(),
      eventSourceFactory: () => new FakeEventSource(),
      document,
    });
    client.start();
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it("ACKs every repeated event but shows its stamp animation only once", async () => {
    const source = new FakeEventSource();
    const acknowledged = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const seen = new Set<string>();
    const showAnimation = vi.fn((received: StampedEvent) => shouldShowStampAnimation(seen, received));
    const client = new RealtimeClient({
      refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      acknowledge: acknowledged,
      onStamped: showAnimation,
      eventSourceFactory: () => source,
      document,
    });
    client.start();
    source.emitStamped(event);
    source.emitStamped(event);
    await Promise.resolve();
    expect(acknowledged).toHaveBeenCalledTimes(2);
    expect(showAnimation.mock.results.map((result) => result.value)).toEqual([true, false]);
    client.stop();
  });
});
