import { useCallback, useEffect, useMemo, useState } from "react";
import type { StatusResponse } from "@hcd-stamp-rally/shared";
import { ApiError, createAdminApi, createParticipantApi } from "../api.js";
import { formatOpensAt } from "../opening.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import styles from "./ParticipantAccessCard.module.css";

type Props = { className?: string; onUnauthorized: () => void; password: string };

// 仕様7章・4-8: 一般開放の日時と状態を示し、開放前はこの端末だけ参加者画面を使えるようにする。
export function ParticipantAccessCard({ className, onUnauthorized, password }: Props) {
  const participantApi = useMemo(() => createParticipantApi(), []);
  const adminApi = useMemo(() => createAdminApi(password), [password]);
  const [status, setStatus] = useState<StatusResponse>();
  const [statusError, setStatusError] = useState(false);
  const [unlockError, setUnlockError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await participantApi.getStatus());
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, [participantApi]);

  // 仕様7章: ダッシュボードのほかの情報と同じく30秒ごとに取り直す。
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const unlock = async () => {
    setUnlocking(true);
    setUnlockError(false);
    try {
      await adminApi.unlockPreview();
      await refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setUnlockError(true);
    } finally {
      setUnlocking(false);
    }
  };

  // status.open はこの端末の解除を含むため、一般公開かどうかは時刻だけで判断する。
  const publicOpen = status !== undefined && Date.parse(status.server_time) >= Date.parse(status.opens_at);
  const unlocked = status !== undefined && !publicOpen && status.open;
  return (
    <Card as="section" className={className}>
      <h2>参加者画面の公開</h2>
      {status && <dl className={styles.facts}>
        <div><dt>一般開放</dt><dd>{formatOpensAt(status.opens_at, "ja")}</dd></div>
        <div><dt>現在の状態</dt><dd>{publicOpen ? "公開中" : "開始前"}</dd></div>
      </dl>}
      {status && !publicOpen && (unlocked
        ? <p className={styles.unlocked}>この端末は開始前の参加者画面を使えます。<a href="/">参加者画面を開く</a></p>
        : <Button disabled={unlocking} fullWidth type="button" variant="secondary" onClick={() => { void unlock(); }}>{unlocking ? "解除中…" : "この端末で開始前の参加者画面を使う"}</Button>)}
      {statusError && <p className={styles.message} role="alert">公開状態を取得できませんでした。30秒後に再試行します。</p>}
      {unlockError && <p className={styles.message} role="alert">この端末を解除できませんでした。通信を確認して、もう一度押してください。</p>}
    </Card>
  );
}
