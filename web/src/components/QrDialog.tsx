import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef } from "react";
import type { Copy } from "../data/content.js";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function useScreenWakeLock(enabled: boolean): void {
  const sentinel = useRef<WakeLockSentinelLike | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const release = async () => {
      const lock = sentinel.current;
      sentinel.current = undefined;
      if (lock) await lock.release();
    };
    const request = async () => {
      if (sentinel.current) return;
      try {
        const lock = await (navigator as NavigatorWithWakeLock).wakeLock?.request("screen");
        if (cancelled) await lock?.release();
        else sentinel.current = lock;
      } catch {
        // 対応していないブラウザを含め、QR表示自体は継続する。
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void request();
      else void release().catch(() => undefined);
    };
    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void release().catch(() => undefined);
    };
  }, [enabled]);
}

type Props = {
  token: string;
  copy: Copy;
  onClose: () => void;
};

// 仕様4-2: QRは75 CSS px、誤り訂正レベルMで1枚だけ描画する。
export function QrDialog({ token, copy, onClose }: Props) {
  useScreenWakeLock(true);

  return (
    <section className="qr-screen" aria-label="QR code">
      <button className="icon-button qr-close" type="button" onClick={onClose} aria-label={copy.close}>×</button>
      <div className="qr-card">
        <QRCodeSVG value={token} size={75} level="M" includeMargin={false} aria-label="Stamp QR code" />
        <p>{copy.qrInstruction}</p>
        <p className="subtle">{copy.brightness}</p>
      </div>
      <button className="button secondary" type="button" onClick={onClose}>{copy.close}</button>
    </section>
  );
}
