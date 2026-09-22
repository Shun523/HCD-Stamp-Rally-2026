import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse, Spot, StampedEvent } from "@hcd-stamp-rally/shared";
import { apiBaseUrl, ApiError, createParticipantApi } from "./api.js";
import { AdminDashboard } from "./components/AdminDashboard.js";
import { DevGallery } from "./components/DevGallery.js";
import { GoalPage } from "./components/GoalPage.js";
import { InfoPopup } from "./components/InfoPopup.js";
import { IntroScreen } from "./components/IntroScreen.js";
import { ParticipantHeader } from "./components/ParticipantHeader.js";
import { QrDialog } from "./components/QrDialog.js";
import { SponsorsPage } from "./components/SponsorsPage.js";
import { SpotMap } from "./components/SpotMap.js";
import { StampAnimation } from "./components/StampAnimation.js";
import { StampBook } from "./components/StampBook.js";
import type { InfoTileKind } from "./components/ui/InfoTile.js";
import { content, detectInitialLanguage, type Language } from "./data/content.js";
import { RealtimeClient } from "./realtime.js";
import { shouldShowStampAnimation } from "./stamp-events.js";
import "./styles.css";
import styles from "./App.module.css";

type Screen = "loading" | "intro" | "book" | "qr" | "map" | "sponsors" | "goal";

const introductionKey = "hcd-stamp-rally-introduction-seen";

const sampleSpots: Spot[] = [1, 2, 3, 4, 5].map((number) => ({
  id: `spot-${String(number).padStart(2, "0")}`,
  name_ja: `スポット${number}（サンプル）`,
  name_en: `Spot ${number} (Sample)`,
  display_order: number,
  lat: 34.685 + number / 10_000,
  lng: 133.92 + number / 10_000,
  description_ja: `キャンパス内のスポット${number}です（サンプル）。`,
  description_en: `This is spot ${number} on campus (Sample).`,
  location_note_ja: null,
  location_note_en: null,
  is_sample: true,
}));

function introductionSeen(): boolean { return localStorage.getItem(introductionKey) === "true"; }

export function ParticipantApp() {
  const api = useMemo(() => createParticipantApi(), []);
  const [language, setLanguage] = useState<Language>(() => detectInitialLanguage());
  const [screen, setScreen] = useState<Screen>("loading");
  const [me, setMe] = useState<MeResponse>();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [error, setError] = useState<string>();
  const [animation, setAnimation] = useState<StampedEvent>();
  const [popup, setPopup] = useState<InfoTileKind>();
  const seenEventIds = useRef(new Set<string>());
  const copy = content.copy[language];

  const refreshMe = useCallback(async () => {
    try {
      const latest = await api.getMe();
      setMe(latest);
      // 仕様4-1: 再訪はスタンプ帳。完走画面への遷移は5個目の押印時または中央GOALから行う。
      setScreen((current) => current === "loading" ? (introductionSeen() ? "book" : "intro") : current);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401 ? copy.sessionError : copy.sessionError);
    }
  }, [api, copy.sessionError]);

  const handleStamped = useCallback((event: StampedEvent) => {
    const isNew = shouldShowStampAnimation(seenEventIds.current, event);
    if (isNew) {
      setAnimation(event);
      setScreen((current) => {
        if (event.completed || event.stamp_count >= event.total_spots) return "goal";
        return current === "qr" ? "book" : current;
      });
    }
    // 仕様4-4 / 5-4: 重複を含め常に最新の押印帳を再取得する。ACKはRealtimeClientが毎回返す。
    void refreshMe();
  }, [refreshMe]);

  // 仕様4-4: SSE、再接続時の再取得、visibilitychange、10秒ポーリングをアプリ最上位で維持する。
  useEffect(() => {
    void refreshMe();
    void api.getSpots().then((response) => setSpots([...response.spots].sort((left, right) => left.display_order - right.display_order))).catch(() => setError(copy.spotsError));
  }, [api, copy.spotsError, refreshMe]);

  useEffect(() => {
    const realtime = new RealtimeClient({ acknowledge: api.acknowledge, document, eventsUrl: `${apiBaseUrl}/api/events`, onStamped: handleStamped, refresh: refreshMe });
    realtime.start();
    return () => realtime.stop();
  }, [api.acknowledge, handleStamped, refreshMe]);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const orderedSpots = spots.length > 0 ? spots : sampleSpots;
  const stampedSpotIds = new Set(me?.stamps.map((stamp) => stamp.spot_id) ?? []);
  const animationSpot = orderedSpots.find((spot) => spot.id === animation?.spot_id);
  const animationSpotName = animationSpot ? (language === "ja" ? animationSpot.name_ja : animationSpot.name_en) : animation?.spot_id ?? "";
  const activeTab = screen === "map" ? "map" : screen === "sponsors" ? "sponsors" : "book";
  const openTab = (tab: "book" | "map" | "sponsors") => { setPopup(undefined); setScreen(tab); };

  let body: React.ReactNode;
  switch (screen) {
    case "loading": body = <main className={styles.loading}><p>{copy.loading}</p></main>; break;
    case "intro": body = <IntroScreen copy={copy} onStart={() => { localStorage.setItem(introductionKey, "true"); setScreen("book"); }} />; break;
    case "book": body = <StampBook copy={copy} onGoal={() => setScreen("goal")} onInfo={setPopup} onQr={() => setScreen("qr")} spots={orderedSpots} stampedSpotIds={stampedSpotIds} />; break;
    case "qr": body = me ? <QrDialog copy={copy} token={me.token} onClose={() => setScreen("book")} /> : <main className={styles.loading}><p>{copy.loading}</p></main>; break;
    case "map": body = <SpotMap copy={copy} language={language} spots={orderedSpots} stampedSpotIds={stampedSpotIds} />; break;
    case "sponsors": body = <SponsorsPage copy={copy} language={language} />; break;
    case "goal": body = <GoalPage copy={copy} language={language} onBack={() => setScreen("book")} spots={orderedSpots} />; break;
  }

  const showHeader = screen !== "loading" && screen !== "intro" && screen !== "qr";
  return <div className={styles.participantApp}>{showHeader && <ParticipantHeader active={activeTab} copy={copy} language={language} onLanguageChange={setLanguage} onTabChange={openTab} />}{error && <p className={styles.error} role="alert">{error}</p>}{body}<InfoPopup copy={copy} isOpen={popup !== undefined} kind={popup} language={language} onClose={() => setPopup(undefined)} />{animation && <StampAnimation copy={copy} event={animation} onClose={() => setAnimation(undefined)} onGoal={() => { setAnimation(undefined); setScreen("goal"); }} spotName={animationSpotName} />}</div>;
}

export function App() {
  if (window.location.pathname.startsWith("/admin")) return <AdminDashboard />;
  if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/gallery")) return <DevGallery />;
  return <ParticipantApp />;
}
