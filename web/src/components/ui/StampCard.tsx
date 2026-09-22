import { useEffect, useRef } from "react";
import type { Spot } from "@hcd-stamp-rally/shared";
import type { Copy, Language } from "../../data/content.js";
import { translate } from "../../data/content.js";
import { CardStampSlot, type QrOrigin } from "./CardStampSlot.js";
import { PrizeStub } from "./PrizeStub.js";
import styles from "./StampCard.module.css";

type Props = {
  activeQrSpotId?: string;
  copy: Copy;
  focusReturnSpotId?: string;
  focusReturnToHeading?: boolean;
  language: Language;
  onFocusReturnHandled: () => void;
  onGoal: () => void;
  onQr: (origin: QrOrigin) => void;
  spots: Spot[];
  stampedSpotIds: ReadonlySet<string>;
};

// 仕様4-1 / design-stamp-card 4-1: 上段3・下段2の丸い押印欄を持つ1枚の台紙。
export function StampCard({ activeQrSpotId, copy, focusReturnSpotId, focusReturnToHeading = false, language, onFocusReturnHandled, onGoal, onQr, spots, stampedSpotIds }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const slotElements = useRef(new Map<string, HTMLElement>());
  const count = stampedSpotIds.size;
  const complete = spots.length > 0 && count >= spots.length;
  const cardLabel = translate(copy.cardA11y, { count, total: spots.length });

  useEffect(() => {
    if (!focusReturnSpotId) return;
    const target = focusReturnToHeading || stampedSpotIds.has(focusReturnSpotId) ? headingRef.current : slotElements.current.get(focusReturnSpotId);
    target?.focus({ preventScroll: true });
    onFocusReturnHandled();
  }, [focusReturnSpotId, focusReturnToHeading, onFocusReturnHandled, stampedSpotIds]);

  return (
    <section aria-label={cardLabel} className={styles.card} data-stamp-card="true">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>{copy.cardEyebrow}</p>
          <h2 data-stamp-card-heading="true" ref={headingRef} tabIndex={-1}>{copy.cardTitle}</h2>
        </div>
        <p className={styles.eventName}>{copy.cardUniversity}<br />{copy.cardEvent}</p>
      </header>
      <p className={styles.instructions}>{copy.cardInstructions}</p>
      <div className={styles.slots}>
        {spots.map((spot, index) => {
          const stamped = stampedSpotIds.has(spot.id);
          return <CardStampSlot activeQrOrigin={activeQrSpotId === spot.id} emptyLabel={copy.cardSlotEmpty} key={spot.id} number={index + 1} onOpenQr={onQr} slotRef={(element) => {
            if (element) slotElements.current.set(spot.id, element);
            else slotElements.current.delete(spot.id);
          }} stampHere={copy.stampHere} stamped={stamped} stampedLabel={copy.cardSlotStamped} spotId={spot.id} spotName={language === "ja" ? spot.name_ja : spot.name_en} />;
        })}
      </div>
      <PrizeStub complete={complete} copy={copy} onGoal={onGoal} remaining={Math.max(0, spots.length - count)} />
    </section>
  );
}

export type { QrOrigin };
