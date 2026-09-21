import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse, Spot, StampedEvent } from "@hcd-stamp-rally/shared";
import { apiBaseUrl, ApiError, createParticipantApi } from "./api.js";
import { AdminDashboard } from "./components/AdminDashboard.js";
import { LanguageToggle } from "./components/LanguageToggle.js";
import { QrDialog } from "./components/QrDialog.js";
import { SpotMap } from "./components/SpotMap.js";
import { StampAnimation } from "./components/StampAnimation.js";
import { content, detectInitialLanguage, translate, type Copy, type Language } from "./data/content.js";
import { stampAssetPath } from "./data/stamps.js";
import { RealtimeClient } from "./realtime.js";
import { shouldShowStampAnimation } from "./stamp-events.js";
import "./styles.css";

type Screen = "loading" | "intro" | "book" | "qr" | "map" | "recovery" | "goal";

const introductionKey = "hcd-stamp-rally-introduction-seen";

function introductionSeen(): boolean {
  return localStorage.getItem(introductionKey) === "true";
}

function Header({ language, onLanguageChange }: { language: Language; onLanguageChange: (language: Language) => void }) {
  const copy = content.copy[language];
  return <header className="participant-header"><span>{copy.eventName}</span><LanguageToggle language={language} label={copy.language} onChange={onLanguageChange} /></header>;
}

export function ParticipantApp() {
  const api = useMemo(() => createParticipantApi(), []);
  const [language, setLanguage] = useState<Language>(() => detectInitialLanguage());
  const [screen, setScreen] = useState<Screen>("loading");
  const [me, setMe] = useState<MeResponse>();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [error, setError] = useState<string>();
  const [animation, setAnimation] = useState<StampedEvent>();
  const seenEventIds = useRef(new Set<string>());
  const copy = content.copy[language];

  const refreshMe = useCallback(async () => {
    try {
      const latest = await api.getMe();
      setMe(latest);
      setScreen((current) => {
        if (latest.completed) return "goal";
        return current === "loading" ? (introductionSeen() ? "book" : "intro") : current;
      });
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401 ? "セッションを開始できませんでした。ページを再読み込みしてください。" : "スタンプ帳を更新できませんでした。通信を確認してください。");
    }
  }, [api]);

  const handleStamped = useCallback((event: StampedEvent) => {
    const isNew = shouldShowStampAnimation(seenEventIds.current, event);
    if (isNew) setAnimation(event);
    setScreen(event.completed || event.stamp_count >= event.total_spots ? "goal" : "book");
    void refreshMe();
  }, [refreshMe]);

  // 仕様4-4: 接続切断・画面復帰・常時ポーリングの全経路で状態を補正する。
  useEffect(() => {
    void refreshMe();
    void api.getSpots().then((response) => setSpots(response.spots.sort((left, right) => left.display_order - right.display_order))).catch(() => setError("スポット情報を取得できませんでした。"));
  }, [api, refreshMe]);

  useEffect(() => {
    const realtime = new RealtimeClient({
      refresh: refreshMe,
      acknowledge: api.acknowledge,
      onStamped: handleStamped,
      document,
      eventsUrl: `${apiBaseUrl}/api/events`,
    });
    realtime.start();
    return () => realtime.stop();
  }, [api.acknowledge, handleStamped, refreshMe]);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const stampedSpotIds = new Set(me?.stamps.map((stamp) => stamp.spot_id) ?? []);
  const orderedSpots = spots.length > 0 ? spots : [1, 2, 3, 4, 5].map((number) => ({
    id: `spot-${String(number).padStart(2, "0")}`,
    name_ja: `スポット${number}（サンプル）`, name_en: `Spot ${number} (Sample)`, display_order: number,
    lat: 0, lng: 0, description_ja: "", description_en: "", location_note_ja: null, location_note_en: null,
  }));

  const body = (() => {
    switch (screen) {
      case "loading": return <main className="centered"><p>Loading…</p></main>;
      case "intro": return <Intro copy={copy} onStart={() => { localStorage.setItem(introductionKey, "true"); setScreen("book"); }} />;
      case "book": return <StampBook copy={copy} spots={orderedSpots} stampedSpotIds={stampedSpotIds} onQr={() => setScreen("qr")} onMap={() => setScreen("map")} onRecovery={() => setScreen("recovery")} />;
      case "qr": return me ? <QrDialog token={me.token} copy={copy} onClose={() => setScreen("book")} /> : null;
      case "map": return <main className="page"><h1>{copy.map}</h1><SpotMap spots={orderedSpots} stampedSpotIds={stampedSpotIds} language={language} copy={copy} /><button className="button secondary" type="button" onClick={() => setScreen("book")}>{copy.back}</button></main>;
      case "recovery": return <main className="page recovery"><h1>{copy.recoveryTitle}</h1><p>{copy.recoveryBody}</p><button className="button secondary" type="button" onClick={() => setScreen("book")}>{copy.back}</button></main>;
      case "goal": return <Goal copy={copy} language={language} onBack={() => setScreen("book")} />;
    }
  })();

  return (
    <div className="participant-app">
      {screen !== "qr" && <Header language={language} onLanguageChange={setLanguage} />}
      {error && <p className="error participant-error" role="alert">{error}</p>}
      {body}
      {animation && <StampAnimation event={animation} copy={copy} onClose={() => setAnimation(undefined)} />}
    </div>
  );
}

// 仕様4-1: 初回説明は遊び方、機器写真、ブラウザ保存の注意を表示する。
function Intro({ copy, onStart }: { copy: Copy; onStart: () => void }) {
  return <main className="page intro"><img className="machine-photo" src="/images/stamp-machine.svg" alt={copy.stampMachinePhoto} /><p className="eyebrow">WELCOME</p><h1>{copy.howToPlay}</h1><ol className="steps">{copy.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol><p className="notice">{copy.browserNotice}</p><button className="button" type="button" onClick={onStart}>{copy.start}</button></main>;
}

// 仕様4-1/4-2: 未押印の5枠だけが、共通トークンを使うQR表示へ遷移する。
function StampBook({ copy, spots, stampedSpotIds, onQr, onMap, onRecovery }: { copy: Copy; spots: Spot[]; stampedSpotIds: ReadonlySet<string>; onQr: () => void; onMap: () => void; onRecovery: () => void }) {
  const count = stampedSpotIds.size;
  return <main className="page stamp-book"><h1>{copy.stampBook}</h1><p className="progress">{translate(copy.progress, { count })}</p><div className="stamp-grid">{spots.map((spot) => {
    const stamped = stampedSpotIds.has(spot.id);
    return <button className={stamped ? "stamp-slot is-stamped" : "stamp-slot"} type="button" key={spot.id} disabled={stamped} onClick={onQr} aria-label={stamped ? `${spot.id} ${copy.stamped}` : `${spot.id} ${copy.showQr}`}>{stamped ? <img src={stampAssetPath(spot.id)} alt="" /> : <><span>{spot.id}</span><small>{copy.showQr}</small></>}</button>;
  })}</div><button className="button secondary wide" type="button" onClick={onMap}>{copy.map}</button><footer><button className="footer-link" type="button" onClick={onRecovery}>{copy.recovery}</button></footer></main>;
}

function Goal({ copy, language, onBack }: { copy: Copy; language: Language; onBack: () => void }) {
  return <main className="page goal"><p className="goal-mark">★</p><h1>{copy.goalTitle}</h1><p>{copy.goalMessage}</p><section className="prize-card"><span>{copy.prize}</span><strong>{content.prizeExchange[language]}</strong></section><button className="button secondary" type="button" onClick={onBack}>{copy.backToBook}</button></main>;
}

export function App() {
  return window.location.pathname.startsWith("/admin") ? <AdminDashboard /> : <ParticipantApp />;
}
