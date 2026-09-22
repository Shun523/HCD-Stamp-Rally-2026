import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef } from "react";
import type { Copy } from "../data/content.js";
import { Button } from "./ui/Button.js";
import { Band, Card } from "./ui/Card.js";
import { Chip } from "./ui/Chip.js";
import { CropMarks, SpeechBubble } from "./ui/Decorations.js";
import { NumberBadge } from "./ui/NumberBadge.js";
import { Tag } from "./ui/Tag.js";
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

type Props = { copy: Copy; onClose: () => void; token: string };

// 仕様4-2: 75 CSS px・訂正レベルMのQRとScreen Wake Lockを、この全画面だけで扱う。
export function QrDialog({ copy, onClose, token }: Props) {
  useScreenWakeLock(true);
  return (
    <main aria-label="QR code" className={styles.page}>
      <Chip>{copy.eventChip}</Chip>
      <Band className={styles.band}><Tag className={styles.tag}>{copy.qrTag}</Tag><h1>{copy.qrTitle}</h1></Band>
      <Card className={styles.qrCard}><CropMarks /><div className={styles.qrTarget}><div className={styles.qrCode}><QRCodeSVG aria-label="Stamp QR code" includeMargin={false} level="M" size={75} value={token} /></div><SpeechBubble>{copy.qrBubble}</SpeechBubble></div></Card>
      <ol className={styles.steps}>{copy.qrSteps.map((step, index) => <li key={step}><NumberBadge number={index + 1} /><span>{step}</span></li>)}</ol>
      <Button className={styles.back} fullWidth type="button" variant="secondary" onClick={onClose}>{copy.backToBook}</Button>
    </main>
  );
}
