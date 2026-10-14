import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DeviceStatus } from "@hcd-stamp-rally/shared";
import { ApiError, createAdminApi } from "../api.js";
import { content } from "../data/content.js";
import { Button } from "./ui/Button.js";
import { Band, Card } from "./ui/Card.js";
import styles from "./AdminDashboard.module.css";

type DashboardData = {
  devices: DeviceStatus[];
  participantCount: number;
  completedCount: number;
  stampCountBySpot: Array<{ spot_id: string; count: number }>;
  sampleSpotsActive: boolean;
};

const formatTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value))
  : "未受信";

const needsAttention = (device: DeviceStatus) => device.status !== "正常" || device.pending_queue_count > 0;

export function sortDevicesForOperations(devices: DeviceStatus[]): DeviceStatus[] {
  // 仕様7章: 要対応機を一覧の先頭にも寄せ、固定アラートから詳細へすぐ移れるようにする。
  return [...devices].sort((left, right) => Number(needsAttention(right)) - Number(needsAttention(left))
    || left.id.localeCompare(right.id));
}

async function loadDashboardData(password: string): Promise<DashboardData> {
  const api = createAdminApi(password);
  const [devices, stats] = await Promise.all([api.getDevices(), api.getStats()]);
  return {
    devices: sortDevicesForOperations(devices.devices),
    participantCount: stats.participant_count,
    completedCount: stats.completed_count,
    stampCountBySpot: stats.stamp_count_by_spot,
    sampleSpotsActive: stats.sample_spots_active,
  };
}

function playAlert(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => { void context.close(); });
  } catch {
    // 仕様7章: 音声を許可しない端末でも、固定アラートとブラウザ通知は残す。
  }
}

function notifyAlert(devices: DeviceStatus[]): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("スタンプ機の要対応アラート", {
    body: devices.map((device) => `${device.id}: ${device.status} / 未送信 ${device.pending_queue_count}件`).join("\n"),
  });
}

function Dashboard({ initialData, onSignOut, password }: {
  initialData: DashboardData;
  onSignOut: (message?: string) => void;
  password: string;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const lastAlertKey = useRef("");
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loadDashboardData(password));
      setUpdatedAt(new Date());
      setError(undefined);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onSignOut("認証の有効性を確認できませんでした。共有パスワードを再入力してください。");
        return;
      }
      setError("情報を更新できませんでした。30秒後に再試行します。");
    } finally {
      setRefreshing(false);
    }
  }, [onSignOut, password]);

  // 仕様7章: 機器・参加状況は30秒ごとに再取得する。
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const alertDevices = useMemo(() => data.devices.filter(needsAttention), [data.devices]);
  const alertKey = alertDevices.map((device) => `${device.id}:${device.status}:${device.pending_queue_count}`).join("|");
  useEffect(() => {
    if (alertKey && alertKey !== lastAlertKey.current) {
      playAlert();
      notifyAlert(alertDevices);
    }
    lastAlertKey.current = alertKey;
  }, [alertKey, alertDevices]);

  const completionRate = data.participantCount > 0
    ? Math.round((data.completedCount / data.participantCount) * 100)
    : 0;
  const sampleDataActive = content.isSample || data.sampleSpotsActive;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><p>STAFF</p><h1>運営ダッシュボード</h1></div>
        <button className={styles.textButton} type="button" onClick={() => onSignOut()}>ログアウト</button>
      </header>
      {(sampleDataActive || alertDevices.length > 0 || error) && <div className={styles.alertStack}>
        {sampleDataActive && <Band className={styles.sampleWarning} role="alert">サンプルデータで稼働中です。スポット情報・画面文言・協賛企業を本番データへ差し替えてください。</Band>}
        {alertDevices.length > 0 && <Band className={styles.alerts} role="alert">
          <strong>要対応のスタンプ機</strong>
          <ul>{alertDevices.map((device) => <li key={device.id}>
            {device.id}：{device.status !== "正常" ? device.status : ""}
            {device.pending_queue_count > 0 ? ` 未送信キュー ${device.pending_queue_count}件` : ""}
          </li>)}</ul>
        </Band>}
        {error && <Band className={styles.error} role="alert">{error}</Band>}
      </div>}
      <div className={styles.updateBar}>
        <span>最終更新 <time dateTime={updatedAt.toISOString()}>{formatTime(updatedAt.toISOString())}</time></span>
        <button className={styles.textButton} type="button" disabled={refreshing} onClick={() => { void refresh(); }}>
          {refreshing ? "更新中…" : "今すぐ更新"}
        </button>
      </div>
      <Card as="section" className={styles.section}>
        <h2>機器稼働状況</h2>
        <div className={styles.deviceCards}>
          {data.devices.map((device) => <DeviceCard key={device.id} device={device} />)}
          {data.devices.length === 0 && <p>機器情報はまだありません。</p>}
        </div>
      </Card>
      <Card as="section" className={styles.section}>
        <h2>参加状況</h2>
        <div className={styles.statGrid}>
          <article><span>累計参加者</span><strong>{data.participantCount}</strong><small>目標 100名</small></article>
          <article><span>完走者</span><strong>{data.completedCount}</strong><small>目標 完走率 60%（現在 {completionRate}%）</small></article>
        </div>
        <h3>スポット別押印数</h3>
        <ul className={styles.statsList}>{data.stampCountBySpot.map((stat) => <li key={stat.spot_id}><span>{stat.spot_id}</span><strong>{stat.count} 回</strong></li>)}</ul>
      </Card>
    </main>
  );
}

function DeviceCard({ device }: { device: DeviceStatus }) {
  const healthy = !needsAttention(device);
  return <article className={[styles.deviceCard, healthy ? styles.healthy : styles.needsAttention].join(" ")}>
    <div><h3>{device.id}</h3><span>{device.status}</span></div>
    <dl>
      <div><dt>スポット</dt><dd>{device.spot_id ?? "未割当"}</dd></div>
      <div><dt>最終ハートビート</dt><dd>{formatTime(device.last_heartbeat_at)}</dd></div>
      <div><dt>直近の押印数</dt><dd>{device.last_stamp_count}</dd></div>
      <div><dt>未送信キュー</dt><dd>{device.pending_queue_count}件</dd></div>
      <div><dt>バッテリー</dt><dd>{device.battery_level === null ? "–" : `${device.battery_level}%`}</dd></div>
      <div><dt>本日のACK未到達</dt><dd>{device.ack_timeout_count}件</dd></div>
      {device.last_ack_timeout_at && <div><dt>最終ACK未到達</dt><dd>{formatTime(device.last_ack_timeout_at)}</dd></div>}
    </dl>
  </article>;
}

export function AdminDashboard() {
  const [session, setSession] = useState<{ data: DashboardData; password: string }>();
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const signOut = useCallback((message?: string) => {
    setSession(undefined);
    setEntry("");
    setError(message);
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entry || submitting) return;
    // ユーザー操作中に要求し、許可後は異常を画面外でも通知する（仕様7章）。
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    setSubmitting(true);
    setError(undefined);
    try {
      const data = await loadDashboardData(entry);
      setSession({ data, password: entry });
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401
        ? "パスワードが正しくありません。"
        : caught instanceof ApiError && caught.status === 429
          ? "認証の試行回数が多いため、時間をおいて再度お試しください。"
          : "管理情報を取得できませんでした。通信を確認して再試行してください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (session) return <Dashboard initialData={session.data} password={session.password} onSignOut={signOut} />;
  return <main className={styles.login}>
    <Card className={styles.loginCard}>
      <form onSubmit={(event) => { void signIn(event); }}>
        <p>STAFF ONLY</p>
        <h1>運営ダッシュボード</h1>
        {error && <Band className={styles.loginError} role="alert">{error}</Band>}
        <label htmlFor="admin-password">共有パスワード</label>
        <input id="admin-password" type="password" value={entry} onChange={(event) => setEntry(event.target.value)} autoComplete="current-password" required />
        <Button disabled={submitting} fullWidth type="submit">{submitting ? "確認中…" : "表示する"}</Button>
      </form>
    </Card>
  </main>;
}
