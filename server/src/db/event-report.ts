import { asc } from "drizzle-orm";
import type { AppDb } from "./client.js";
import { deliveries, devices, sessions, spots, stamps } from "./schema.js";

// 仕様11章: 生データは11月30日を目安に削除する。書き出しは raw/（削除対象）と summary/（集計のみで残せる）に分ける。

export type ExportRows = {
  spots: Array<{ id: string; nameJa: string; displayOrder: number }>;
  sessions: Array<{ id: string; createdAt: Date; userAgent: string }>;
  stamps: Array<{ id: number; sessionId: string; spotId: string; stampedAt: Date; deviceStampedAt: Date | null; deviceId: string; visitOrder: number }>;
  deliveries: Array<{ eventId: string; stampId: number; sessionId: string; deliveredAt: Date | null; ackedAt: Date | null; ackTimedOutAt: Date | null; result: string }>;
  devices: Array<{ id: string; spotId: string | null; lastHeartbeatAt: Date | null; status: string }>;
};

export type AckLogEntry = {
  timestamp: Date;
  eventId: string;
  deviceId: string;
  ackReceived: boolean;
  serverSaveMs: number;
  ssePublishMs: number;
  ackWaitMs: number;
};

export type HeartbeatLogEntry = {
  timestamp: Date;
  deviceId: string;
  uptimeSeconds: number;
  lastStampCount: number;
  pendingQueueCount: number;
  batteryLevel: number | null;
};

export type AlreadyLogEntry = { timestamp: Date; deviceId: string; spotId: string };

export type ServerLogs = { acks: AckLogEntry[]; heartbeats: HeartbeatLogEntry[]; alreadyStamps: AlreadyLogEntry[] };

export type ExportOptions = {
  openAt: Date;
  endAt: Date;
  exportedAt: Date;
  logs?: ServerLogs;
};

export async function fetchExportRows(db: AppDb): Promise<ExportRows> {
  // 機体のAPIキーのハッシュと押印トークンは書き出さない。
  const [spotRows, sessionRows, stampRows, deliveryRows, deviceRows] = await Promise.all([
    db.select({ id: spots.id, nameJa: spots.nameJa, displayOrder: spots.displayOrder }).from(spots).orderBy(asc(spots.displayOrder)),
    db.select({ id: sessions.id, createdAt: sessions.createdAt, userAgent: sessions.userAgent }).from(sessions).orderBy(asc(sessions.createdAt), asc(sessions.id)),
    db.select().from(stamps).orderBy(asc(stamps.stampedAt), asc(stamps.id)),
    db.select().from(deliveries),
    db.select({ id: devices.id, spotId: devices.spotId, lastHeartbeatAt: devices.lastHeartbeatAt, status: devices.status }).from(devices).orderBy(asc(devices.id)),
  ]);
  return { spots: spotRows, sessions: sessionRows, stamps: stampRows, deliveries: deliveryRows, devices: deviceRows };
}

// `gcloud logging read --format=json` の出力（配列）か、1行1件のJSONを受け付ける。
// 仕様6-4の押印ログと、仕様5-3・5-6の既押印・ハートビートのログを読み、ほかのログは無視する。
export function parseServerLogs(text: string): ServerLogs {
  const logs: ServerLogs = { acks: [], heartbeats: [], alreadyStamps: [] };
  const trimmed = text.trim();
  if (!trimmed) return logs;
  const entries: unknown[] = trimmed.startsWith("[")
    ? JSON.parse(trimmed) as unknown[]
    : trimmed.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown);
  for (const entry of entries) {
    const record = entry as { timestamp?: string; jsonPayload?: Record<string, unknown> } & Record<string, unknown>;
    const payload = record.jsonPayload ?? record;
    const timestamp = new Date(String(record.timestamp ?? payload.timestamp ?? ""));
    const deviceId = String(payload.deviceId ?? "");
    if (payload.message === "stamp ACK received" || payload.message === "stamp ACK timed out") {
      logs.acks.push({
        timestamp,
        eventId: String(payload.eventId ?? ""),
        deviceId,
        ackReceived: payload.ack_received === true,
        serverSaveMs: Number(payload.server_save_ms ?? 0),
        ssePublishMs: Number(payload.sse_publish_ms ?? 0),
        ackWaitMs: Number(payload.ack_wait_ms ?? 0),
      });
    } else if (payload.message === "device heartbeat") {
      logs.heartbeats.push({
        timestamp,
        deviceId,
        uptimeSeconds: Number(payload.uptime_seconds ?? 0),
        lastStampCount: Number(payload.last_stamp_count ?? 0),
        pendingQueueCount: Number(payload.pending_queue_count ?? 0),
        batteryLevel: typeof payload.battery_level === "number" ? payload.battery_level : null,
      });
    } else if (payload.message === "stamp already collected") {
      logs.alreadyStamps.push({ timestamp, deviceId, spotId: String(payload.spotId ?? "") });
    }
  }
  for (const list of [logs.acks, logs.heartbeats, logs.alreadyStamps]) list.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  return logs;
}

export function buildEventExport(rows: ExportRows, options: ExportOptions): Map<string, string> {
  // セッションIDはCookieの値そのものなので、書き出しでは作成順の通し番号に置き換える。
  const participantIds = new Map(rows.sessions.map((session, index) => [session.id, `p${String(index + 1).padStart(4, "0")}`]));
  const participantOf = (sessionId: string) => participantIds.get(sessionId) ?? "unknown";
  const files = new Map<string, string>();

  files.set("raw/sessions.csv", toCsv(
    ["participant", "created_at", "is_test", "is_bot", "platform", "browser", "user_agent"],
    rows.sessions.map((session) => {
      const { platform, browser } = classifyUserAgent(session.userAgent);
      return [participantOf(session.id), toJst(session.createdAt), session.createdAt < options.openAt, isBotUserAgent(session.userAgent), platform, browser, session.userAgent];
    }),
  ));
  files.set("raw/stamps.csv", toCsv(
    ["stamp_id", "participant", "spot_id", "visit_order", "stamped_at", "device_stamped_at", "device_id"],
    rows.stamps.map((stamp) => [stamp.id, participantOf(stamp.sessionId), stamp.spotId, stamp.visitOrder, toJst(stamp.stampedAt), toJst(stamp.deviceStampedAt), stamp.deviceId]),
  ));
  files.set("raw/deliveries.csv", toCsv(
    ["event_id", "stamp_id", "participant", "result", "delivered_at", "acked_at", "ack_timed_out_at"],
    [...rows.deliveries].sort((left, right) => left.stampId - right.stampId)
      .map((delivery) => [delivery.eventId, delivery.stampId, participantOf(delivery.sessionId), delivery.result, toJst(delivery.deliveredAt), toJst(delivery.ackedAt), toJst(delivery.ackTimedOutAt)]),
  ));
  files.set("raw/devices.csv", toCsv(
    ["device_id", "spot_id", "status", "last_heartbeat_at"],
    rows.devices.map((device) => [device.id, device.spotId ?? "", device.status, toJst(device.lastHeartbeatAt)]),
  ));
  if (options.logs) {
    files.set("raw/ack-logs.csv", toCsv(
      ["timestamp", "event_id", "device_id", "ack_received", "server_save_ms", "sse_publish_ms", "ack_wait_ms"],
      options.logs.acks.map((log) => [toJst(log.timestamp), log.eventId, log.deviceId, log.ackReceived, log.serverSaveMs, log.ssePublishMs, log.ackWaitMs]),
    ));
    files.set("raw/heartbeats.csv", toCsv(
      ["timestamp", "device_id", "uptime_seconds", "last_stamp_count", "pending_queue_count", "battery_level"],
      options.logs.heartbeats.map((log) => [toJst(log.timestamp), log.deviceId, log.uptimeSeconds, log.lastStampCount, log.pendingQueueCount, log.batteryLevel]),
    ));
    files.set("raw/already-stamps.csv", toCsv(
      ["timestamp", "device_id", "spot_id"],
      options.logs.alreadyStamps.map((log) => [toJst(log.timestamp), log.deviceId, log.spotId]),
    ));
  }

  // 仕様4-8: 一般開放より前に発行されたセッションはすべて試験用なので、集計から除く。
  // ページを開くだけでセッションが発行されるため、リンクのプレビューを作るボットも除く。
  const openSessions = rows.sessions.filter((session) => session.createdAt >= options.openAt);
  const participants = openSessions.filter((session) => !isBotUserAgent(session.userAgent));
  const participantSet = new Set(participants.map((session) => session.id));
  const eventStamps = rows.stamps.filter((stamp) => participantSet.has(stamp.sessionId));
  const eventStampIds = new Set(eventStamps.map((stamp) => stamp.id));
  const eventDeliveries = rows.deliveries.filter((delivery) => eventStampIds.has(delivery.stampId));
  const totalSpots = rows.spots.length;

  const stampsBySession = groupBy(eventStamps, (stamp) => stamp.sessionId);
  const stampCounts = participants.map((session) => new Set((stampsBySession.get(session.id) ?? []).map((stamp) => stamp.spotId)).size);
  const stampedParticipants = stampCounts.filter((count) => count > 0).length;
  const completedSessions = [...stampsBySession.values()].filter((list) => totalSpots > 0 && new Set(list.map((stamp) => stamp.spotId)).size >= totalSpots);
  const completionTimes = completedSessions.map((list) => {
    const times = list.map((stamp) => stamp.stampedAt.getTime()).sort((left, right) => left - right);
    return { completedAt: new Date(times[times.length - 1]!), durationMs: times[times.length - 1]! - times[0]! };
  });
  const durations = completionTimes.map((completion) => completion.durationMs);

  const distribution = Array.from({ length: totalSpots + 1 }, (_, stampsCollected) => [stampsCollected, stampCounts.filter((count) => count === stampsCollected).length] as const);
  files.set("summary/stamp-count-distribution.csv", toCsv(["stamps", "participants"], distribution.map((row) => [...row])));

  const bySpot = rows.spots.map((spot) => {
    const spotStamps = eventStamps.filter((stamp) => stamp.spotId === spot.id);
    return [spot.id, spot.nameJa, spotStamps.length, spotStamps.filter((stamp) => stamp.visitOrder === 1).length] as const;
  });
  files.set("summary/by-spot.csv", toCsv(["spot_id", "name", "stamps", "first_visits"], bySpot.map((row) => [...row])));

  const slots = timeSlots(options.openAt, [options.endAt, ...participants.map((session) => session.createdAt), ...eventStamps.map((stamp) => stamp.stampedAt)]);
  const countBySlot = (values: Date[]) => {
    const counts = slots.map(() => 0);
    for (const value of values) {
      const index = Math.min(slots.length - 1, Math.max(0, Math.floor((value.getTime() - options.openAt.getTime()) / SLOT_MS)));
      counts[index] = (counts[index] ?? 0) + 1;
    }
    return counts;
  };
  const newBySlot = countBySlot(participants.map((session) => session.createdAt));
  const stampsBySlot = countBySlot(eventStamps.map((stamp) => stamp.stampedAt));
  const completionsBySlot = countBySlot(completionTimes.map((completion) => completion.completedAt));
  const byTime = slots.map((slot, index) => [toJstClock(slot), newBySlot[index] ?? 0, stampsBySlot[index] ?? 0, completionsBySlot[index] ?? 0] as const);
  files.set("summary/by-time.csv", toCsv(["slot_start", "new_participants", "stamps", "completions"], byTime.map((row) => [...row])));

  const byDevice = [...groupBy(eventStamps, (stamp) => stamp.deviceId).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([deviceId, list]) => [deviceId, [...new Set(list.map((stamp) => stamp.spotId))].join(" "), list.length] as const);
  files.set("summary/by-device.csv", toCsv(["device_id", "spot_ids", "stamps"], byDevice.map((row) => [...row])));

  const browsers = [...groupBy(participants, (session) => {
    const { platform, browser } = classifyUserAgent(session.userAgent);
    return `${platform}\t${browser}`;
  }).entries()]
    .map(([key, list]) => [...key.split("\t"), list.length] as [string, string, number])
    .sort((left, right) => right[2] - left[2] || left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  files.set("summary/browsers.csv", toCsv(["platform", "browser", "participants"], browsers));

  const deliveryCounts = countValues(eventDeliveries.map((delivery) => delivery.result));
  const acked = deliveryCounts.get("acked") ?? 0;

  let latencyRows: Array<[string, number, number | null, number | null, number | null]> | undefined;
  let deviceRows: Array<[string, number, number, number, number | null, number | null, number]> | undefined;
  if (options.logs) {
    // 仕様6-4: 押印ログのレイテンシー。試験の分は一般開放前の時刻なので除く。
    const logs = options.logs.acks.filter((log) => log.timestamp >= options.openAt);
    const metrics: Array<[string, (log: AckLogEntry) => number]> = [
      ["server_save_ms", (log) => log.serverSaveMs],
      ["sse_publish_ms", (log) => log.ssePublishMs],
      ["ack_wait_ms", (log) => log.ackWaitMs],
    ];
    latencyRows = metrics.map(([name, pick]) => {
      const values = logs.map(pick).sort((left, right) => left - right);
      return [name, values.length, percentile(values, 0.5), percentile(values, 0.95), values.at(-1) ?? null];
    });
    files.set("summary/ack-latency.csv", toCsv(["metric", "count", "median", "p95", "max"], latencyRows));

    // 仕様5-6: 稼働時間（10:00〜16:00）のハートビートから、途切れた最長時間・再起動・未送信・電池を機体ごとにまとめる。
    const inEvent = (value: Date) => value >= options.openAt && value <= options.endAt;
    const heartbeatsByDevice = groupBy(options.logs.heartbeats.filter((log) => inEvent(log.timestamp)), (log) => log.deviceId);
    const alreadyByDevice = groupBy(options.logs.alreadyStamps.filter((log) => inEvent(log.timestamp)), (log) => log.deviceId);
    deviceRows = [...new Set([...heartbeatsByDevice.keys(), ...alreadyByDevice.keys()])].sort((left, right) => left.localeCompare(right)).map((deviceId) => {
      const heartbeats = heartbeatsByDevice.get(deviceId) ?? [];
      const times = [options.openAt.getTime(), ...heartbeats.map((log) => log.timestamp.getTime()), options.endAt.getTime()];
      const longestGapMs = Math.max(...times.slice(1).map((time, index) => time - times[index]!));
      const restarts = heartbeats.filter((log, index) => index > 0 && log.uptimeSeconds < heartbeats[index - 1]!.uptimeSeconds).length;
      const batteries = heartbeats.flatMap((log) => log.batteryLevel === null ? [] : [log.batteryLevel]);
      return [
        deviceId,
        heartbeats.length,
        Math.round(longestGapMs / 6_000) / 10,
        restarts,
        heartbeats.length ? Math.max(...heartbeats.map((log) => log.pendingQueueCount)) : null,
        batteries.length ? Math.min(...batteries) : null,
        alreadyByDevice.get(deviceId)?.length ?? 0,
      ];
    });
    files.set("summary/devices.csv", toCsv(["device_id", "heartbeats", "longest_gap_min", "restarts", "max_pending_queue", "min_battery", "already_stamps"], deviceRows));
  }

  const lines = [
    "# スタンプラリー集計",
    "",
    `書き出し: ${toJst(options.exportedAt)}`,
    "",
    `対象は一般開放（${toJst(options.openAt)}）以降に発行されたセッションです。それより前の試験用セッション${rows.sessions.length - openSessions.length}件は除外しました。` +
      `リンクのプレビューなどのボットのセッション${openSessions.length - participants.length}件も除外しました。`,
    "",
    "## 参加",
    "",
    `- 参加者（セッション）: ${participants.length}`,
    `- 1つ以上押印: ${stampedParticipants}（${ratio(stampedParticipants, participants.length)}）`,
    `- 完走（${totalSpots}スポット）: ${completedSessions.length}（参加者の${ratio(completedSessions.length, participants.length)}、押印した人の${ratio(completedSessions.length, stampedParticipants)}）`,
    `- 押印の合計: ${eventStamps.length}`,
    `- 完走までの時間（最初の押印から最後の押印まで）: 中央値 ${minutes(percentile([...durations].sort((left, right) => left - right), 0.5))}、最短 ${minutes(durations.length ? Math.min(...durations) : null)}、最長 ${minutes(durations.length ? Math.max(...durations) : null)}`,
    "",
    "## スタンプ数の分布",
    "",
    markdownTable(["スタンプ数", "参加者"], distribution.map((row) => [...row])),
    "",
    "## スポット別",
    "",
    markdownTable(["スポット", "名前", "押印", "最初に訪れた人"], bySpot.map((row) => [...row])),
    "",
    "## 時間帯別（30分ごと）",
    "",
    markdownTable(["開始", "新規参加", "押印", "完走"], byTime.map((row) => [...row])),
    "",
    "## 押印の通知（SSE・ACK）",
    "",
    `- ACK到達: ${acked}/${eventDeliveries.length}（${ratio(acked, eventDeliveries.length)}）`,
    `- 内訳: ${["acked", "delivered", "timeout", "pending"].map((result) => `${result} ${deliveryCounts.get(result) ?? 0}`).join("、")}`,
    "- timeout は3秒以内にACKが届かなかったもの（スマホが通知に接続していなかった場合を含む）。押印の記録自体は成立している（仕様5-4）。delivered・pending はACKを待つ間にサーバーが止まったもの",
    "",
    "## 機体別",
    "",
    markdownTable(["機体", "スポット", "押印"], byDevice.map((row) => [...row])),
    "",
    "## ブラウザ",
    "",
    markdownTable(["OS", "ブラウザ", "参加者"], browsers),
    "",
    "## 処理時間（Cloud Loggingの押印ログ）",
    "",
    latencyRows
      ? markdownTable(["項目", "件数", "中央値(ms)", "95%(ms)", "最大(ms)"], latencyRows.map((row) => row.map((value) => value ?? "-")))
      : "ログを指定していないため集計していません（`--logs`）。",
    "",
    "## 機体の状態（Cloud Loggingのハートビート・既押印のログ、10:00〜16:00）",
    "",
    deviceRows
      ? markdownTable(["機体", "ハートビート", "途切れた最長(分)", "再起動", "未送信の最大", "電池の最低(%)", "2回目の押印"], deviceRows.map((row) => row.map((value) => value ?? "-")))
      : "ログを指定していないため集計していません（`--logs`）。",
    "",
    "途切れた最長は、10:00・各ハートビート・16:00の間隔の最大値（通常は約0.5分）。再起動は、稼働時間が前回より小さくなった回数。",
    "",
  ];
  files.set("summary/summary.md", lines.join("\n"));
  return files;
}

export function classifyUserAgent(userAgent: string): { platform: string; browser: string } {
  const platform = /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
      : /Windows/.test(userAgent) ? "Windows"
        : /Macintosh/.test(userAgent) ? "macOS" : "other";
  // アプリ内ブラウザは保存先が分かれる（4-1の注意）ため、Safari・Chromeと区別する。
  const browser = /\bLine\//i.test(userAgent) ? "LINE"
    : /Instagram/.test(userAgent) ? "Instagram"
      : /FBAN|FBAV/.test(userAgent) ? "Facebook"
        : /EdgiOS|EdgA|Edg\//.test(userAgent) ? "Edge"
          : /SamsungBrowser/.test(userAgent) ? "Samsung Internet"
            : /FxiOS|Firefox\//.test(userAgent) ? "Firefox"
              : /CriOS|Chrome\//.test(userAgent) ? "Chrome"
                : /Safari\//.test(userAgent) ? "Safari" : "other";
  return { platform, browser };
}

// LINE・Facebook（facebookexternalhit）と Slack のリンクのプレビュー、Firefox 24 と Chrome 80 を同時に名乗るクローラー。
// どれも当日はページのHTMLだけを取り、画面のファイルもAPIも呼ばなかった。LINEのアプリ内ブラウザ（Line/）はボットではない。
export function isBotUserAgent(userAgent: string): boolean {
  return /facebookexternalhit|Slackbot|Firefox\/24\.0 Chrome\//.test(userAgent);
}

function toCsv(header: string[], rows: Array<Array<string | number | boolean | null>>): string {
  const cell = (value: string | number | boolean | null) => {
    let text = value === null ? "" : String(value);
    // 表計算ソフトで式として解釈されないようにする（user_agent は参加者が送る値）。
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
  };
  // Excelで日本語が文字化けしないよう、UTF-8のBOMを付ける。
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(",")).join("\n")}\n`;
}

function markdownTable(header: string[], rows: Array<Array<string | number>>): string {
  if (rows.length === 0) return "（該当なし）";
  return [header, header.map(() => "---"), ...rows.map((row) => row.map(String))]
    .map((row) => `| ${row.map((value) => value.replaceAll("|", "\\|")).join(" | ")} |`).join("\n");
}

const JAPAN_OFFSET_MS = 9 * 60 * 60 * 1_000;
const SLOT_MS = 30 * 60 * 1_000;

function toJst(value: Date | null): string {
  if (!value) return "";
  return `${new Date(value.getTime() + JAPAN_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

function toJstClock(value: Date): string {
  return toJst(value).slice(5, 16).replace("T", " ");
}

function timeSlots(start: Date, values: Date[]): Date[] {
  const last = Math.max(...values.map((value) => value.getTime()));
  const slots: Date[] = [];
  for (let time = start.getTime(); time <= last; time += SLOT_MS) slots.push(new Date(time));
  return slots;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function percentile(sorted: number[], rank: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(rank * sorted.length) - 1)] ?? null;
}

function ratio(part: number, whole: number): string {
  return whole === 0 ? "-" : `${Math.round((part / whole) * 1000) / 10}%`;
}

function minutes(milliseconds: number | null): string {
  return milliseconds === null ? "-" : `${Math.round(milliseconds / 60_000)}分`;
}
