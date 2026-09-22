import { Star } from "lucide-react";
import { useRef } from "react";
import { StampImage } from "./StampParts.js";
import styles from "./CardStampSlot.module.css";

export type QrOrigin = {
  diameter: number;
  spotId: string;
  x: number;
  y: number;
};

type SlotElement = HTMLButtonElement | HTMLSpanElement;

type Props = {
  activeQrOrigin?: boolean;
  emptyLabel: string;
  number: number;
  onOpenQr: (origin: QrOrigin) => void;
  slotRef?: (element: SlotElement | null) => void;
  stampHere: string;
  stamped: boolean;
  stampedLabel: string;
  spotId: string;
  spotName: string;
};

// デザイン4-1/4-2: CSSの破線ではなく、台紙とQR表示で共有するSVGの円を使う。
export function StampSlotDottedCircle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={[styles.dottedCircle, className ?? ""].filter(Boolean).join(" ")} preserveAspectRatio="none" viewBox="0 0 100 100">
      <circle cx="50" cy="50" fill="none" r="48" stroke="var(--color-ink)" strokeDasharray="3 5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StampSlotWatermark() {
  return (
    <svg aria-hidden="true" className={styles.watermark} viewBox="0 0 100 100">
      <circle className={styles.watermarkFill} cx="50" cy="50" r="39" />
      <circle className={styles.watermarkLine} cx="50" cy="50" fill="none" r="29" />
      <Star className={styles.watermarkStar} fill="var(--color-watermark-fill)" strokeWidth={4} x="31" y="31" width="38" height="38" />
    </svg>
  );
}

function WearMarks() {
  return <span aria-hidden="true" className={styles.wearMarks}><i /><i /><i /><i /><i /></span>;
}

// 仕様4-2 / デザイン4-1: 台紙だけで使う、丸い押印欄。
export function CardStampSlot({ activeQrOrigin = false, emptyLabel, number, onOpenQr, slotRef, stampHere, stamped, stampedLabel, spotId, spotName }: Props) {
  const circleRef = useRef<HTMLSpanElement>(null);
  const accessibleLabel = `${spotName} ${number}: ${stamped ? stampedLabel : emptyLabel}`;
  const badge = <span aria-hidden="true" className={styles.badge}>{number}</span>;
  const name = <span className={styles.name}>{spotName}</span>;

  if (stamped) {
    return (
      <span aria-label={accessibleLabel} className={[styles.slot, styles.stamped].join(" ")} data-card-stamp-slot="true" data-stamped="true" id={`card-slot-${spotId}`} ref={slotRef} role="img">
        <span className={styles.circle} data-card-stamp-circle="true" ref={circleRef}>
          <StampSlotDottedCircle />
          <span className={styles.stampGraphic}><StampImage alt="" spotId={spotId} /></span>
          <WearMarks />
          {badge}
        </span>
        {name}
      </span>
    );
  }

  return (
    <button aria-label={accessibleLabel} className={[styles.slot, styles.empty, activeQrOrigin ? styles.zoomOrigin : ""].filter(Boolean).join(" ")} data-card-stamp-slot="true" data-qr-origin={activeQrOrigin || undefined} data-stamped="false" id={`card-slot-${spotId}`} ref={slotRef} type="button" onClick={(event) => {
      const target = circleRef.current ?? event.currentTarget;
      const bounds = target.getBoundingClientRect();
      onOpenQr({ diameter: Math.min(bounds.width, bounds.height), spotId, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    }}>
      <span className={styles.circle} data-card-stamp-circle="true" ref={circleRef}>
        <StampSlotDottedCircle />
        <StampSlotWatermark />
        <span className={styles.emptyContent}>{stampHere}</span>
        {badge}
      </span>
      {name}
    </button>
  );
}
