import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MeResponse, Spot, StampedEvent } from "@hcd-stamp-rally/shared";
import { apiBaseUrl, ApiError, createParticipantApi } from "./api.js";
import { AdminDashboard } from "./components/AdminDashboard.js";
import { DevGallery } from "./components/DevGallery.js";
import { InfoPopup } from "./components/InfoPopup.js";
import { ParticipantGate } from "./components/ParticipantGate.js";
import { ParticipantHeader } from "./components/ParticipantHeader.js";
import { QrDialog } from "./components/QrDialog.js";
import { SponsorsPage } from "./components/SponsorsPage.js";
import { SpotMap } from "./components/SpotMap.js";
import { StampAnimation } from "./components/StampAnimation.js";
import { StampBook } from "./components/StampBook.js";
import type { ParticipantTab } from "./components/ui/HeaderTabs.js";
import type { InfoTileKind } from "./components/ui/InfoTile.js";
import type { QrOrigin } from "./components/ui/StampCard.js";
import { content, detectInitialLanguage, type Language } from "./data/content.js";
import { RealtimeClient } from "./realtime.js";
import { shouldShowStampAnimation } from "./stamp-events.js";
import "./styles.css";
import styles from "./App.module.css";

type Screen = "loading" | "book" | "qr" | "map" | "sponsors";
type QrCloseDestination = ParticipantTab;
type QrHistoryState = { hcdStampRallyQr: true; qrOrigin: QrOrigin };

// 仕様4-1: /api/spots が届くまで、台紙の押印欄5つだけを描く仮の枠。参加者にサンプルの名前を見せないよう空にする。
const placeholderSpots: Spot[] = [1, 2, 3, 4, 5].map((number) => ({
  id: `spot-${String(number).padStart(2, "0")}`,
  name_ja: "",
  name_en: "",
  display_order: number,
  lat: 0,
  lng: 0,
  description_ja: "",
  description_en: "",
  location_note_ja: null,
  location_note_en: null,
  is_sample: false,
}));

function qrHistoryState(value: unknown): QrHistoryState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state = value as Partial<QrHistoryState>;
  if (state.hcdStampRallyQr !== true || !state.qrOrigin) return undefined;
  const { diameter, spotId, x, y } = state.qrOrigin;
  if (typeof diameter !== "number" || diameter <= 0 || typeof spotId !== "string" || typeof x !== "number" || typeof y !== "number") return undefined;
  return { hcdStampRallyQr: true, qrOrigin: state.qrOrigin };
}

export function ParticipantApp() {
  const api = useMemo(() => createParticipantApi(), []);
  const [language, setLanguage] = useState<Language>(() => detectInitialLanguage());
  const [screen, setScreen] = useState<Screen>("loading");
  const [me, setMe] = useState<MeResponse>();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [error, setError] = useState<string>();
  const [animation, setAnimation] = useState<StampedEvent>();
  const [popup, setPopup] = useState<InfoTileKind>();
  const [qrOrigin, setQrOrigin] = useState<QrOrigin>();
  const [qrClosing, setQrClosing] = useState(false);
  const [focusReturnSpotId, setFocusReturnSpotId] = useState<string>();
  const [focusReturnToHeading, setFocusReturnToHeading] = useState(false);
  const seenEventIds = useRef(new Set<string>());
  const screenRef = useRef<Screen>("loading");
  const qrOriginRef = useRef<QrOrigin | undefined>(undefined);
  const qrOriginStampedRef = useRef(false);
  const qrClosingRef = useRef(false);
  const qrCloseDestinationRef = useRef<QrCloseDestination>("book");
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const copy = content.copy[language];

  useEffect(() => { screenRef.current = screen; }, [screen]);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) {
      setHeaderHeight(0);
      return undefined;
    }
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [language, screen]);

  const startQrClosing = useCallback((destination: QrCloseDestination) => {
    qrCloseDestinationRef.current = destination;
    if (qrClosingRef.current) return;
    qrClosingRef.current = true;
    setQrClosing(true);
  }, []);

  const requestQrClose = useCallback((destination: QrCloseDestination) => {
    qrCloseDestinationRef.current = destination;
    if (qrClosingRef.current) return;
    if (qrHistoryState(window.history.state)) {
      window.history.back();
      return;
    }
    startQrClosing(destination);
  }, [startQrClosing]);

  const finishQrClose = useCallback(() => {
    const destination = qrCloseDestinationRef.current;
    const origin = qrOriginRef.current;
    qrClosingRef.current = false;
    qrOriginRef.current = undefined;
    qrCloseDestinationRef.current = "book";
    setQrClosing(false);
    setQrOrigin(undefined);
    if (destination === "book" && origin) {
      setFocusReturnSpotId(origin.spotId);
      setFocusReturnToHeading(qrOriginStampedRef.current);
    }
    qrOriginStampedRef.current = false;
    screenRef.current = destination;
    setScreen(destination);
  }, []);

  const openQr = useCallback((origin: QrOrigin) => {
    if (screenRef.current === "qr" || qrClosingRef.current) return;
    const currentState = typeof window.history.state === "object" && window.history.state ? window.history.state : {};
    window.history.pushState({ ...currentState, hcdStampRallyQr: true, qrOrigin: origin }, "", window.location.href);
    qrOriginRef.current = origin;
    qrOriginStampedRef.current = false;
    qrCloseDestinationRef.current = "book";
    setPopup(undefined);
    setQrOrigin(origin);
    setQrClosing(false);
    screenRef.current = "qr";
    setScreen("qr");
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const nextQrState = qrHistoryState(event.state);
      if (screenRef.current === "qr") {
        if (!nextQrState) startQrClosing(qrCloseDestinationRef.current);
        return;
      }
      if (screenRef.current === "book" && nextQrState) {
        qrClosingRef.current = false;
        qrOriginRef.current = nextQrState.qrOrigin;
        qrOriginStampedRef.current = false;
        qrCloseDestinationRef.current = "book";
        setQrClosing(false);
        setQrOrigin(nextQrState.qrOrigin);
        screenRef.current = "qr";
        setScreen("qr");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [startQrClosing]);

  const refreshMe = useCallback(async () => {
    try {
      const latest = await api.getMe();
      setMe(latest);
      // 仕様4-1（v1.12）: 初回アクセスも再訪も、読み込み後はスタンプ帳から始める。
      setScreen((current) => {
        const next = current === "loading" ? "book" : current;
        screenRef.current = next;
        return next;
      });
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401 ? copy.sessionError : copy.sessionError);
    }
  }, [api, copy.sessionError]);

  const handleStamped = useCallback((event: StampedEvent) => {
    const isNew = shouldShowStampAnimation(seenEventIds.current, event);
    if (isNew) {
      setAnimation(event);
      // 仕様4-2: 押印を受けたらQR表示を閉じる。完走しても画面は移さず、台紙がCOMPLETE表示になる（4-1、v1.12）。
      if (screenRef.current === "qr") {
        qrOriginStampedRef.current = event.spot_id === qrOriginRef.current?.spotId;
        requestQrClose("book");
      }
    }
    // 仕様4-4 / 5-4: 重複を含め常に最新の押印帳を再取得する。ACKはRealtimeClientが毎回返す。
    void refreshMe();
  }, [refreshMe, requestQrClose]);

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

  const orderedSpots = spots.length > 0 ? spots : placeholderSpots;
  const stampedSpotIds = new Set(me?.stamps.map((stamp) => stamp.spot_id) ?? []);
  const animationSpot = orderedSpots.find((spot) => spot.id === animation?.spot_id);
  const animationSpotName = animationSpot ? (language === "ja" ? animationSpot.name_ja : animationSpot.name_en) : animation?.spot_id ?? "";
  const activeTab = screen === "map" ? "map" : screen === "sponsors" ? "sponsors" : "book";
  const openTab = (tab: ParticipantTab) => {
    setPopup(undefined);
    if (screenRef.current === "qr") {
      requestQrClose(tab);
      return;
    }
    screenRef.current = tab;
    setScreen(tab);
  };
  const stampBook = <StampBook activeQrSpotId={screen === "qr" ? qrOrigin?.spotId : undefined} copy={copy} focusReturnSpotId={focusReturnSpotId} focusReturnToHeading={focusReturnToHeading} isQrActive={screen === "qr"} language={language} onFocusReturnHandled={() => { setFocusReturnSpotId(undefined); setFocusReturnToHeading(false); }} onInfo={setPopup} onQr={openQr} spots={orderedSpots} stampedSpotIds={stampedSpotIds} />;

  let body: React.ReactNode;
  switch (screen) {
    case "loading": body = <main className={styles.loading}><p>{copy.loading}</p></main>; break;
    case "book": body = stampBook; break;
    case "qr": body = stampBook; break;
    case "map": body = <SpotMap copy={copy} language={language} spots={spots} stampedSpotIds={stampedSpotIds} />; break;
    case "sponsors": body = <SponsorsPage copy={copy} language={language} />; break;
  }

  const showHeader = screen !== "loading";
  const qrBackgroundState = screen === "qr" ? (qrClosing ? "closing" : "open") : undefined;
  const qrBackgroundStyle = qrOrigin ? { "--qr-origin-x": `${qrOrigin.x}px`, "--qr-origin-y": `${qrOrigin.y}px` } as CSSProperties : undefined;
  return <div className={styles.participantApp}>{showHeader && <ParticipantHeader active={activeTab} copy={copy} headerRef={headerRef} isQrActive={screen === "qr"} language={language} onLanguageChange={setLanguage} onTabChange={openTab} />}<div aria-hidden={screen === "qr" || undefined} className={styles.qrBackground} data-qr-background={qrBackgroundState} inert={screen === "qr"} style={qrBackgroundStyle}>{error && <p className={styles.error} role="alert">{error}</p>}{body}</div><InfoPopup copy={copy} isOpen={popup !== undefined} kind={popup} onClose={() => setPopup(undefined)} />{screen === "qr" && me && <QrDialog copy={copy} headerHeight={headerHeight} isClosing={qrClosing} onClosed={finishQrClose} onCloseRequest={() => requestQrClose("book")} origin={qrOrigin} token={me.token} />}{animation && <StampAnimation copy={copy} event={animation} onClose={() => setAnimation(undefined)} spotName={animationSpotName} />}</div>;
}

export function App() {
  if (window.location.pathname.startsWith("/admin")) return <AdminDashboard />;
  if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/gallery")) return <DevGallery />;
  // 仕様4-8: 参加者画面は一般開放の判定を通してから表示する。
  return <ParticipantGate><ParticipantApp /></ParticipantGate>;
}
