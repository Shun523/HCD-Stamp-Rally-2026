import type { StatusResponse } from "@hcd-stamp-rally/shared";
import type { Language } from "./data/content.js";

export const MAX_STATUS_CHECK_DELAY_MS = 10 * 60_000;
export const MAX_OPENING_JITTER_MS = 30_000;

// 仕様4-8 / デザイン4-10: 開始日時は文言に書かず、opens_at から日本時間で組み立てる。
export function formatOpensAt(opensAt: string, language: Language): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    month: language === "ja" ? "numeric" : "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(opensAt)).map((part) => [part.type, part.value]));
  return language === "ja"
    ? `${parts.month}月${parts.day}日（${parts.weekday}）${parts.hour}:${parts.minute}`
    : `${parts.weekday}, ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} (JST)`;
}

// 仕様4-8: 端末の時計は使わず、サーバー時刻との差で待つ。1回の待ちは最大10分とし、
// 開放の瞬間にアクセスが集中しないよう、残りが10分以内の最後の待ちにだけ0〜30秒の遅れを足す。
export function nextStatusCheckDelay(status: Pick<StatusResponse, "opens_at" | "server_time">, random: () => number = Math.random): number {
  const remaining = Math.max(0, Date.parse(status.opens_at) - Date.parse(status.server_time));
  if (remaining > MAX_STATUS_CHECK_DELAY_MS) return MAX_STATUS_CHECK_DELAY_MS;
  return remaining + Math.floor(random() * MAX_OPENING_JITTER_MS);
}
