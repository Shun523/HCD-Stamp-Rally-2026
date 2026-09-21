import { stampedEventSchema } from "@hcd-stamp-rally/shared";
import type { StampedEvent } from "@hcd-stamp-rally/shared";

export type EventSourceLike = {
  close: () => void;
  addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
};

type VisibilityDocument = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export type RealtimeOptions = {
  refresh: () => Promise<void>;
  acknowledge: (eventId: string) => Promise<void>;
  onStamped: (event: StampedEvent) => void;
  eventSourceFactory?: (url: string) => EventSourceLike;
  document?: VisibilityDocument;
  eventsUrl?: string;
  pollIntervalMs?: number;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
};

const safely = (action: () => Promise<void>) => {
  void action().catch(() => undefined);
};

// 仕様4-4: SSEの再接続、復帰時再取得、visibilitychange、10秒ポーリングを一元管理する。
export class RealtimeClient {
  private source: EventSourceLike | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private reconnectDelay: number;
  private readonly onVisibilityChange = () => {
    if (this.options.document?.visibilityState === "visible") safely(this.options.refresh);
  };

  public constructor(private readonly options: RealtimeOptions) {
    this.reconnectDelay = options.initialReconnectDelayMs ?? 250;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.options.document?.addEventListener("visibilitychange", this.onVisibilityChange);
    this.pollTimer = setInterval(() => safely(this.options.refresh), this.options.pollIntervalMs ?? 10_000);
    this.connect(false);
  }

  public stop(): void {
    this.running = false;
    this.source?.close();
    this.source = undefined;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.reconnectTimer = undefined;
    this.pollTimer = undefined;
    this.options.document?.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private connect(isReconnect: boolean): void {
    if (!this.running) return;
    if (isReconnect) safely(this.options.refresh);
    const factory = this.options.eventSourceFactory ?? ((url: string) => new EventSource(url, { withCredentials: true }));
    const source = factory(this.options.eventsUrl ?? "/api/events");
    this.source = source;
    source.onopen = () => {
      this.reconnectDelay = this.options.initialReconnectDelayMs ?? 250;
    };
    source.onerror = () => {
      if (!this.running || source !== this.source) return;
      source.close();
      this.source = undefined;
      this.queueReconnect();
    };
    source.addEventListener("stamped", (message) => {
      try {
        const event = stampedEventSchema.parse(JSON.parse(message.data));
        // 仕様5-4: 重複配信でもACKは必ず返し、表示側がイベントIDで演出を重複させない。
        safely(() => this.options.acknowledge(event.event_id));
        this.options.onStamped(event);
      } catch {
        // 壊れたイベントは状態を変更せず無視する。
      }
    });
  }

  private queueReconnect(): void {
    if (this.reconnectTimer || !this.running) return;
    const delay = this.reconnectDelay;
    const maximum = this.options.maxReconnectDelayMs ?? 5_000;
    this.reconnectDelay = Math.min(delay * 2, maximum);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect(true);
    }, delay);
  }
}
