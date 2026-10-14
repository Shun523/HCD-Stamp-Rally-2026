import { performance } from "node:perf_hooks";

type Window = {
  count: number;
  expiresAt: number;
};

/** 仕様11章: 単一インスタンス内で制限し、期限切れの接続元情報はメモリから消す。 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();
  private nextSweepAt = 0;

  public constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (![limit, windowMs, maxKeys].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new Error("Rate limit settings must be positive safe integers");
    }
  }

  public retryAfter(key: string): number {
    const now = this.clock();
    this.sweep(now);
    const window = this.windows.get(key);
    if (window && window.expiresAt <= now) this.windows.delete(key);
    else if (window && window.count >= this.limit) return this.remainingSeconds(window, now);
    // 新しい接続元を無制限に記録しない。既存の制限を追い出して回避することも許さない。
    if (!this.windows.has(key) && this.windows.size >= this.maxKeys) {
      const oldest = this.windows.values().next().value as Window;
      return this.remainingSeconds(oldest, now);
    }
    return 0;
  }

  public take(key: string): number {
    const retryAfter = this.retryAfter(key);
    if (retryAfter > 0) return retryAfter;
    const window = this.windows.get(key);
    if (window) window.count += 1;
    else this.windows.set(key, { count: 1, expiresAt: this.clock() + this.windowMs });
    return 0;
  }

  public reset(key: string): void {
    this.windows.delete(key);
  }

  private remainingSeconds(window: Window, now: number): number {
    return Math.max(1, Math.ceil((window.expiresAt - now) / 1_000));
  }

  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    for (const [key, window] of this.windows) {
      if (window.expiresAt <= now) this.windows.delete(key);
    }
    this.nextSweepAt = now + Math.min(this.windowMs, 1_000);
  }
}
