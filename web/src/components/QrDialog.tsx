import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Copy } from "../data/content.js";
import type { QrOrigin } from "./ui/StampCard.js";
import { IconButton } from "./ui/IconButton.js";
import { StampSlotDottedCircle } from "./ui/CardStampSlot.js";
import styles from "./QrDialog.module.css";

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };

function useScreenWakeLock(enabled: boolean): void {
  const sentinel = useRef<WakeLockSentinelLike | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const release = async () => {
      const active = sentinel.current;
      sentinel.current = undefined;
      if (active) await active.release();
    };
    const request = async () => {
      if (sentinel.current) return;
      try {
        const active = await (navigator as NavigatorWithWakeLock).wakeLock?.request("screen");
        if (cancelled) await active?.release();
        else sentinel.current = active;
      } catch {
        // 仕様4-2: 非対応ブラウザでもQRの表示は継続する。
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void request(); else void release().catch(() => undefined); };
    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibilityChange); void release().catch(() => undefined); };
  }, [enabled]);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

type Props = {
  copy: Copy;
  headerHeight: number;
  isClosing: boolean;
  onCloseRequest: () => void;
  onClosed: () => void;
  origin?: QrOrigin;
  token: string;
};

// 仕様4-2: 台紙を紙面で覆い、共通ヘッダーを残して選んだ丸い押印欄を中央へ拡大する。
export function QrDialog({ copy, headerHeight, isClosing, onCloseRequest, onClosed, origin, token }: Props) {
  const backRef = useRef<HTMLButtonElement>(null);
  const closedRef = useRef(false);
  const [phase, setPhase] = useState<"prepare" | "open" | "closing">("prepare");
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useScreenWakeLock(true);

  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const originStyle = {
    "--qr-origin-diameter": `${origin?.diameter ?? 84}px`,
    "--qr-origin-x": `${origin?.x ?? window.innerWidth / 2}px`,
    "--qr-origin-y": `${origin?.y ?? window.innerHeight / 2}px`,
    "--qr-header-height": `${headerHeight}px`,
    "--qr-target-y": `${headerHeight + (viewportHeight - headerHeight) / 2}px`,
  } as CSSProperties;

  // 仕様4-2: QR中にページをスクロールさせず、ヘッダー以外の台紙を固定する。
  useLayoutEffect(() => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      bodyLeft: body.style.left,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
    };
    document.documentElement.dataset.qrOpen = "true";
    document.body.dataset.qrOpen = "true";
    // 仕様4-2: 紙面オーバーレイの背後をスクロールさせない。
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = "100%";
    return () => {
      delete document.documentElement.dataset.qrOpen;
      delete document.body.dataset.qrOpen;
      body.style.left = previous.bodyLeft;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      html.style.overflow = previous.htmlOverflow;
      window.scrollTo(scrollX, scrollY);
    };
  }, []);

  useLayoutEffect(() => {
    if (isClosing) {
      setPhase("closing");
      return undefined;
    }
    if (prefersReducedMotion()) {
      setPhase("open");
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => setPhase("open"));
    return () => window.cancelAnimationFrame(frame);
  }, [isClosing]);

  useEffect(() => {
    if (!isClosing) {
      closedRef.current = false;
      return undefined;
    }
    const finish = () => {
      if (closedRef.current) return;
      closedRef.current = true;
      onClosed();
    };
    const timer = window.setTimeout(finish, prefersReducedMotion() ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [isClosing, onClosed]);

  useEffect(() => {
    if (phase !== "open" || isClosing) return undefined;
    const frame = window.requestAnimationFrame(() => backRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isClosing, phase]);

  // 共通ヘッダーを操作対象に残すため、Tabは通常のフォーカス順に委ねる。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isClosing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRequest();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isClosing, onCloseRequest]);

  return (
    <main aria-label="QR code" className={styles.page} data-qr-phase={phase} role="dialog" style={originStyle}>
      <div aria-hidden="true" className={styles.paper} data-qr-paper="true" />
      <div className={styles.stampCircle} data-qr-stamp-circle="true">
        <StampSlotDottedCircle />
        <div className={styles.qrCode} data-qr-code-container="true"><QRCodeSVG aria-label="Stamp QR code" includeMargin={false} level="M" size={64} value={token} /></div>
      </div>
      <IconButton className={styles.back} disabled={isClosing} label={copy.backToBook} ref={backRef} type="button" onClick={onCloseRequest}><ArrowLeft aria-hidden="true" size={26} strokeWidth={2.25} /></IconButton>
    </main>
  );
}
