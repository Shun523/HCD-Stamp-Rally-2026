import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceStatus } from "@hcd-stamp-rally/shared";
import { ApiError, createAdminApi } from "../api.js";
import { content } from "../data/content.js";

type DashboardData = {
  devices: DeviceStatus[];
  participantCount: number;
  completedCount: number;
  stampCountBySpot: Array<{ spot_id: string; count: number }>;
};

const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "medium",
}).format(new Date(value)) : "未受信";

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
    // ブラウザが音声を許可していない場合も、固定アラートは残す。
  }
}

function notifyAlert(devices: DeviceStatus[]): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("スタンプ機の要対応アラート", {
    body: devices.map((device) => `${device.id}: ${device.status} / 未送信 ${device.pending_queue_count}件`).join("\n"),
  });
}

function Dashboard({ password, onSignOut }: { password: string; onSignOut: () => void }) {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();
  const lastAlertKey = useRef("");

  const refresh = useCallback(async () => {
    try {
      const api = createAdminApi(password);
      const [devices, stats] = await Promise.all([api.getDevices(), api.getStats()]);
      setData({
        devices: devices.devices,
        participantCount: stats.participant_count,
        completedCount: stats.completed_count,
        stampCountBySpot: stats.stamp_count_by_spot,
      });
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401 ? "パスワードが正しくありません。" : "情報を更新できませんでした。30秒後に再試行します。");
    }
  }, [password]);

  // 仕様7章: 管理画面は30秒ごとに機器・参加状況を更新する。
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const alertDevices = data?.devices.filter((device) => device.status === "断" || device.pending_queue_count > 0) ?? [];
  const alertKey = alertDevices.map((device) => `${device.id}:${device.status}:${device.pending_queue_count}`).join("|");
  useEffect(() => {
    if (alertKey && alertKey !== lastAlertKey.current) {
      playAlert();
      notifyAlert(alertDevices);
    }
    lastAlertKey.current = alertKey;
  }, [alertKey]);

  const completionRate = data && data.participantCount > 0 ? Math.round((data.completedCount / data.participantCount) * 100) : 0;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><p className="eyebrow">STAFF</p><h1>運営ダッシュボード</h1></div>
        <button className="text-button" type="button" onClick={onSignOut}>ログアウト</button>
      </header>
      {content.isSample && <p className="sample-warning" role="alert">サンプルデータで稼働中です。スポット情報・画面文言を本番データへ差し替えてください。</p>}
      {alertDevices.length > 0 && (
        <section className="device-alerts" role="alert" aria-live="assertive">
          <strong>要対応のスタンプ機</strong>
          <ul>{alertDevices.map((device) => <li key={device.id}>{device.id}：{device.status === "断" ? "通信断" : ""}{device.pending_queue_count > 0 ? ` 未送信キュー ${device.pending_queue_count}件` : ""}</li>)}</ul>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <section className="dashboard-section" aria-labelledby="device-heading">
        <div className="section-heading"><h2 id="device-heading">機器稼働状況</h2><button className="text-button" type="button" onClick={() => { void refresh(); }}>更新</button></div>
        <div className="device-cards">
          {data?.devices.map((device) => <DeviceCard key={device.id} device={device} />)}
          {data && data.devices.length === 0 && <p>機器情報はまだありません。</p>}
        </div>
      </section>
      <section className="dashboard-section" aria-labelledby="stats-heading">
        <h2 id="stats-heading">参加状況</h2>
        <div className="stat-grid">
          <article><span>累計参加者</span><strong>{data?.participantCount ?? "–"}</strong><small>目標 100名</small></article>
          <article><span>完走者</span><strong>{data?.completedCount ?? "–"}</strong><small>目標 完走率 60%（現在 {data ? `${completionRate}%` : "–"}）</small></article>
        </div>
        <h3>スポット別押印数</h3>
        <ul className="stats-list">
          {data?.stampCountBySpot.map((stat) => <li key={stat.spot_id}><span>{stat.spot_id}</span><strong>{stat.count} 回</strong></li>)}
        </ul>
      </section>
    </main>
  );
}

function DeviceCard({ device }: { device: DeviceStatus }) {
  return (
    <article className={`device-card ${device.status === "正常" && device.pending_queue_count === 0 ? "healthy" : "needs-attention"}`}>
      <div><h3>{device.id}</h3><span className="device-status">{device.status}</span></div>
      <dl>
        <div><dt>スポット</dt><dd>{device.spot_id ?? "未割当"}</dd></div>
        <div><dt>最終ハートビート</dt><dd>{formatTime(device.last_heartbeat_at)}</dd></div>
        <div><dt>直近の押印数</dt><dd>{device.last_stamp_count}</dd></div>
        <div><dt>未送信キュー</dt><dd>{device.pending_queue_count}件</dd></div>
        <div><dt>バッテリー</dt><dd>{device.battery_level === null ? "–" : `${device.battery_level}%`}</dd></div>
      </dl>
    </article>
  );
}

export function AdminDashboard() {
  const [password, setPassword] = useState<string>();
  const [entry, setEntry] = useState("");
  if (password) return <Dashboard password={password} onSignOut={() => setPassword(undefined)} />;
  return (
    <main className="admin-login">
      <form className="login-card" onSubmit={(event) => {
        event.preventDefault();
        if (!entry) return;
        // 仕様7章: 自動監視中のアラートをブラウザ通知でも受け取れるよう、ユーザー操作で許可を求める。
        if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
        setPassword(entry);
      }}>
        <p className="eyebrow">STAFF ONLY</p>
        <h1>運営ダッシュボード</h1>
        <label htmlFor="admin-password">共有パスワード</label>
        <input id="admin-password" type="password" value={entry} onChange={(event) => setEntry(event.target.value)} autoComplete="current-password" required />
        <button className="button" type="submit">表示する</button>
      </form>
    </main>
  );
}
