import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { StatusResponse } from "@hcd-stamp-rally/shared";
import { createParticipantApi } from "../api.js";
import { content, detectInitialLanguage, type Language } from "../data/content.js";
import { nextStatusCheckDelay } from "../opening.js";
import { WaitingScreen } from "./WaitingScreen.js";
import styles from "../App.module.css";

type GateState =
  | { phase: "checking" }
  | { phase: "open" }
  | { phase: "waiting"; status: StatusResponse }
  | { phase: "error" };

type Props = {
  children: ReactNode;
  getStatus?: () => Promise<StatusResponse>;
  reload?: () => void;
};

// 開放前に読み込んだページにはセッションが無いため、/ を読み込み直してサーバーに発行させる（仕様5-1）。
const reloadParticipantApp = () => window.location.replace("/");

// 仕様4-8: 一般開放の判定はサーバーに任せる。開放前は待機画面だけを出し、
// /api/me・SSE・10秒ポーリング（4-4）を始めないよう、子の参加者画面を描画しない。
export function ParticipantGate({ children, getStatus, reload = reloadParticipantApp }: Props) {
  const fetchStatus = useMemo(() => getStatus ?? createParticipantApi().getStatus, [getStatus]);
  const [language, setLanguage] = useState<Language>(() => detectInitialLanguage());
  const [state, setState] = useState<GateState>({ phase: "checking" });
  const copy = content.copy[language];

  useEffect(() => {
    let active = true;
    let opened = false;
    let checkedOnce = false;
    let timer: number | undefined;
    const check = async () => {
      window.clearTimeout(timer);
      let status: StatusResponse;
      try {
        status = await fetchStatus();
      } catch {
        if (!active || opened) return;
        checkedOnce = true;
        setState({ phase: "error" });
        return;
      }
      if (!active || opened) return;
      const isFirstCheck = !checkedOnce;
      checkedOnce = true;
      if (status.open) {
        opened = true;
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (isFirstCheck) setState({ phase: "open" });
        else reload();
        return;
      }
      setState({ phase: "waiting", status });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void check(); }, nextStatusCheckDelay(status));
    };
    // スリープ中はタイマーが止まるため、画面に戻ったときにも取り直す。
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void check();
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchStatus, reload]);

  useEffect(() => {
    if (state.phase !== "open") document.documentElement.lang = language;
  }, [language, state.phase]);

  switch (state.phase) {
    case "open": return children;
    case "waiting": return <WaitingScreen copy={copy} language={language} onLanguageChange={setLanguage} opensAt={state.status.opens_at} />;
    case "error": return <main className={styles.loading}><p className={styles.error} role="alert">{copy.statusError}</p></main>;
    case "checking": return <main className={styles.loading}><p>{copy.loading}</p></main>;
  }
}
