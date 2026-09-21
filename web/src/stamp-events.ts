import type { StampedEvent } from "@hcd-stamp-rally/shared";

// 仕様4-4: EventSourceが再送しても、同じイベントIDの演出は一度だけにする。
export function shouldShowStampAnimation(seenEventIds: Set<string>, event: StampedEvent): boolean {
  if (seenEventIds.has(event.event_id)) return false;
  seenEventIds.add(event.event_id);
  return true;
}
