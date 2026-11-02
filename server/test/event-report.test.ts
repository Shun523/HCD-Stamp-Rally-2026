import { describe, expect, it } from "vitest";
import { buildEventExport, classifyUserAgent, isBotUserAgent, parseServerLogs, type ExportRows, type ServerLogs } from "../src/db/event-report.js";

const jst = (value: string) => new Date(`2026-10-${value}+09:00`);
const openAt = jst("31T10:00:00");
const endAt = jst("31T16:00:00");
const iphoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const androidChrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const iphoneLine = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.17.0";
const linePreviewBot = "facebookexternalhit/1.1;line-poker/1.0";

const rows: ExportRows = {
  spots: [
    { id: "spot-01", nameJa: "図書館", displayOrder: 1 },
    { id: "spot-02", nameJa: "時計台, 正面", displayOrder: 2 },
    { id: "spot-03", nameJa: "学生会館", displayOrder: 3 },
  ],
  sessions: [
    { id: "secret-test", createdAt: jst("30T15:00:00"), userAgent: iphoneSafari },
    { id: "secret-complete", createdAt: jst("31T10:05:00"), userAgent: iphoneSafari },
    { id: "secret-one", createdAt: jst("31T10:20:00"), userAgent: androidChrome },
    { id: "secret-none", createdAt: jst("31T11:00:00"), userAgent: "=HYPERLINK(\"https://example.com\")" },
    { id: "secret-bot", createdAt: jst("31T12:00:00"), userAgent: linePreviewBot },
    { id: "secret-late", createdAt: jst("31T16:30:00"), userAgent: iphoneLine },
  ],
  stamps: [
    { id: 1, sessionId: "secret-test", spotId: "spot-01", stampedAt: jst("30T15:10:00"), deviceStampedAt: jst("30T15:10:00"), deviceId: "dev-01", visitOrder: 1 },
    { id: 2, sessionId: "secret-complete", spotId: "spot-01", stampedAt: jst("31T10:10:00"), deviceStampedAt: jst("31T10:10:00"), deviceId: "dev-01", visitOrder: 1 },
    { id: 3, sessionId: "secret-one", spotId: "spot-01", stampedAt: jst("31T10:30:00"), deviceStampedAt: jst("31T10:30:00"), deviceId: "dev-01", visitOrder: 1 },
    { id: 4, sessionId: "secret-complete", spotId: "spot-02", stampedAt: jst("31T10:40:00"), deviceStampedAt: jst("31T10:40:00"), deviceId: "dev-02", visitOrder: 2 },
    { id: 5, sessionId: "secret-complete", spotId: "spot-03", stampedAt: jst("31T11:15:00"), deviceStampedAt: jst("31T11:15:00"), deviceId: "dev-spare-01", visitOrder: 3 },
  ],
  deliveries: [
    { eventId: "evt_1", stampId: 1, sessionId: "secret-test", deliveredAt: jst("30T15:10:01"), ackedAt: jst("30T15:10:01"), ackTimedOutAt: null, result: "acked" },
    { eventId: "evt_2", stampId: 2, sessionId: "secret-complete", deliveredAt: jst("31T10:10:01"), ackedAt: jst("31T10:10:01"), ackTimedOutAt: null, result: "acked" },
    { eventId: "evt_3", stampId: 3, sessionId: "secret-one", deliveredAt: jst("31T10:30:01"), ackedAt: null, ackTimedOutAt: null, result: "delivered" },
    { eventId: "evt_4", stampId: 4, sessionId: "secret-complete", deliveredAt: jst("31T10:40:01"), ackedAt: jst("31T10:40:01"), ackTimedOutAt: null, result: "acked" },
    { eventId: "evt_5", stampId: 5, sessionId: "secret-complete", deliveredAt: null, ackedAt: null, ackTimedOutAt: jst("31T11:15:04"), result: "timeout" },
  ],
  devices: [
    { id: "dev-01", spotId: "spot-01", lastHeartbeatAt: jst("31T16:00:00"), status: "正常" },
    { id: "dev-spare-01", spotId: "spot-01", lastHeartbeatAt: null, status: "断" },
  ],
};

const build = (logs?: ServerLogs) => buildEventExport(rows, { openAt, endAt, exportedAt: jst("31T17:00:00"), logs });
const lines = (content: string | undefined) => content!.replace(/^\uFEFF/, "").trimEnd().split("\n");

describe("event data export (仕様11章)", () => {
  it("summarises only sessions issued after the general opening", () => {
    const summary = build().get("summary/summary.md")!;
    // 仕様4-8: 一般開放前のセッションは試験用として除外する。
    expect(summary).toContain("試験用セッション1件は除外しました");
    expect(summary).toContain("- 参加者（セッション）: 4");
    expect(summary).toContain("- 1つ以上押印: 2（50%）");
    expect(summary).toContain("- 完走（3スポット）: 1（参加者の25%、押印した人の50%）");
    expect(summary).toContain("- 押印の合計: 4");
    expect(summary).toContain("中央値 65分、最短 65分、最長 65分");
    expect(summary).toContain("- ACK到達: 2/4（50%）");
    expect(summary).toContain("acked 2、delivered 1、timeout 1、pending 0");
  });

  it("keeps bot sessions in raw but leaves them out of the summary", () => {
    const files = build();
    expect(lines(files.get("raw/sessions.csv"))[0]).toBe("participant,created_at,is_test,is_bot,platform,browser,user_agent");
    expect(lines(files.get("raw/sessions.csv"))[5]).toBe(`p0005,2026-10-31T12:00:00+09:00,false,true,other,other,${linePreviewBot}`);
    // リンクのプレビューで作られたセッションは参加者に数えない（参加者・分布・時間帯・ブラウザの数は上のテストと同じ）。
    expect(files.get("summary/summary.md")).toContain("リンクのプレビューなどのボットのセッション1件も除外しました");
  });

  it("detects link-preview bots without catching in-app browsers", () => {
    expect(isBotUserAgent(linePreviewBot)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 facebookexternalhit/1.1 Facebot Twitterbot/1.0")).toBe(true);
    expect(isBotUserAgent("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBe(true);
    // 名乗りの無いクローラー。当日はページのHTMLだけを取り、画面のファイルもAPIも呼ばなかった。
    expect(isBotUserAgent("Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:24.0) Gecko/20100101 Firefox/24.0 Chrome/80.0.3987.132 Safari/537.36")).toBe(true);
    for (const userAgent of [iphoneSafari, androidChrome, iphoneLine]) expect(isBotUserAgent(userAgent)).toBe(false);
  });

  it("replaces cookie session ids with participant numbers in every file", () => {
    const files = build();
    for (const content of files.values()) expect(content).not.toContain("secret-");
    expect(lines(files.get("raw/sessions.csv"))[1]).toBe(`p0001,2026-10-30T15:00:00+09:00,true,false,iOS,Safari,"${iphoneSafari}"`);
    expect(lines(files.get("raw/stamps.csv"))[2]).toBe("2,p0002,spot-01,1,2026-10-31T10:10:00+09:00,2026-10-31T10:10:00+09:00,dev-01");
  });

  it("aggregates by spot, stamp count, time slot and device", () => {
    const files = build();
    expect(lines(files.get("summary/by-spot.csv"))).toEqual([
      "spot_id,name,stamps,first_visits",
      "spot-01,図書館,2,2",
      "spot-02,\"時計台, 正面\",1,0",
      "spot-03,学生会館,1,0",
    ]);
    expect(lines(files.get("summary/stamp-count-distribution.csv"))).toEqual(["stamps,participants", "0,2", "1,1", "2,0", "3,1"]);
    const byTime = lines(files.get("summary/by-time.csv"));
    expect(byTime[0]).toBe("slot_start,new_participants,stamps,completions");
    expect(byTime[1]).toBe("10-31 10:00,2,1,0");
    expect(byTime[2]).toBe("10-31 10:30,0,2,0");
    expect(byTime[3]).toBe("10-31 11:00,1,1,1");
    // 16:00以降に開いた人も最後の枠まで数える。
    expect(byTime.at(-1)).toBe("10-31 16:30,1,0,0");
    expect(lines(files.get("summary/by-device.csv"))).toEqual(["device_id,spot_ids,stamps", "dev-01,spot-01,2", "dev-02,spot-02,1", "dev-spare-01,spot-03,1"]);
  });

  it("guards spreadsheet formulas and classifies in-app browsers", () => {
    const files = build();
    expect(files.get("raw/sessions.csv")).toContain(",other,other,\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(files.get("raw/sessions.csv")!.startsWith("\uFEFF")).toBe(true);
    expect(classifyUserAgent(iphoneLine)).toEqual({ platform: "iOS", browser: "LINE" });
    expect(classifyUserAgent(androidChrome)).toEqual({ platform: "Android", browser: "Chrome" });
    expect(classifyUserAgent(iphoneSafari)).toEqual({ platform: "iOS", browser: "Safari" });
    expect(lines(files.get("summary/browsers.csv"))).toEqual(["platform,browser,participants", "Android,Chrome,1", "iOS,LINE,1", "iOS,Safari,1", "other,other,1"]);
  });

  it("reads ACK logs exported by gcloud and summarises latency", () => {
    const entry = (timestamp: string, message: string, ackWaitMs: number) => ({
      timestamp,
      severity: "INFO",
      jsonPayload: { message, eventId: "evt", deviceId: "dev-01", ack_received: message.endsWith("received"), server_save_ms: 20, sse_publish_ms: 1, ack_wait_ms: ackWaitMs },
    });
    const gcloudJson = JSON.stringify([
      entry("2026-10-31T01:10:00Z", "stamp ACK received", 60),
      entry("2026-10-31T01:20:00Z", "stamp ACK received", 80),
      entry("2026-10-31T02:15:00Z", "stamp ACK timed out", 3000),
      entry("2026-10-30T06:00:00Z", "stamp ACK received", 9999),
      { timestamp: "2026-10-31T01:00:00Z", jsonPayload: { message: "admin authentication failed" } },
    ]);
    const logs = parseServerLogs(gcloudJson);
    expect(logs.acks).toHaveLength(4);
    expect(parseServerLogs(gcloudJson.slice(1, -1).replaceAll("},{\"timestamp\"", "}\n{\"timestamp\"")).acks).toHaveLength(4);

    const files = build(logs);
    // 一般開放前（10月30日）の試験ログは集計に含めない。
    expect(lines(files.get("summary/ack-latency.csv"))).toEqual([
      "metric,count,median,p95,max",
      "server_save_ms,3,20,20,20",
      "sse_publish_ms,3,1,1,1",
      "ack_wait_ms,3,80,3000,3000",
    ]);
    expect(lines(files.get("raw/ack-logs.csv"))).toHaveLength(5);
    expect(files.get("summary/summary.md")).toContain("| ack_wait_ms | 3 | 80 | 3000 | 3000 |");
  });

  it("summarises device heartbeats and duplicate stamps from the logs (仕様5-3・5-6)", () => {
    const heartbeat = (timestamp: string, uptime: number, pending: number, battery: number | null) => ({
      timestamp,
      jsonPayload: { message: "device heartbeat", deviceId: "dev-01", uptime_seconds: uptime, last_stamp_count: 0, pending_queue_count: pending, battery_level: battery },
    });
    const already = (timestamp: string, deviceId: string) => ({ timestamp, jsonPayload: { message: "stamp already collected", deviceId, spotId: "spot-01", stamp_count: 1 } });
    const logs = parseServerLogs(JSON.stringify([
      heartbeat("2026-10-31T03:00:00Z", 20, 3, 55),
      heartbeat("2026-10-31T01:00:30Z", 100, 0, 80),
      heartbeat("2026-10-31T01:01:00Z", 130, 1, null),
      already("2026-10-31T02:00:00Z", "dev-01"),
      already("2026-10-31T04:00:00Z", "dev-02"),
      already("2026-10-30T06:00:00Z", "dev-01"),
    ]));
    expect(logs.heartbeats.map((log) => log.uptimeSeconds)).toEqual([100, 130, 20]);

    const files = build(logs);
    // dev-01: 12:00から16:00まで途切れ、稼働時間が130秒から20秒へ戻ったので再起動1回。
    // dev-02: ハートビートが1回も無いので6時間途切れたことになる。10月30日の既押印は数えない。
    expect(lines(files.get("summary/devices.csv"))).toEqual([
      "device_id,heartbeats,longest_gap_min,restarts,max_pending_queue,min_battery,already_stamps",
      "dev-01,3,240,1,3,55,1",
      "dev-02,0,360,0,,,1",
    ]);
    expect(lines(files.get("raw/heartbeats.csv"))[1]).toBe("2026-10-31T10:00:30+09:00,dev-01,100,0,0,80");
    expect(lines(files.get("raw/already-stamps.csv"))).toHaveLength(4);
    expect(files.get("summary/summary.md")).toContain("| dev-01 | 3 | 240 | 1 | 3 | 55 | 1 |");
  });
});
