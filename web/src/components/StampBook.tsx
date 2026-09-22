import type { Spot } from "@hcd-stamp-rally/shared";
import type { Copy, Language } from "../data/content.js";
import { InfoTile, type InfoTileKind } from "./ui/InfoTile.js";
import { StampCard, type QrOrigin } from "./ui/StampCard.js";
import styles from "./StampBook.module.css";

type Props = {
  activeQrSpotId?: string;
  copy: Copy;
  focusReturnSpotId?: string;
  focusReturnToHeading?: boolean;
  language: Language;
  isQrActive?: boolean;
  onFocusReturnHandled: () => void;
  onGoal: () => void;
  onInfo: (kind: InfoTileKind) => void;
  onQr: (origin: QrOrigin) => void;
  spots: Spot[];
  stampedSpotIds: ReadonlySet<string>;
};

// 仕様4-1 / デザイン4-1: 台紙だけを主役にし、案内ボタンは台紙の外に置く。
export function StampBook({ activeQrSpotId, copy, focusReturnSpotId, focusReturnToHeading, isQrActive = false, language, onFocusReturnHandled, onGoal, onInfo, onQr, spots, stampedSpotIds }: Props) {
  return (
    <main aria-hidden={isQrActive || undefined} className={styles.page} data-qr-active={isQrActive || undefined} inert={isQrActive}>
      <StampCard activeQrSpotId={activeQrSpotId} copy={copy} focusReturnSpotId={focusReturnSpotId} focusReturnToHeading={focusReturnToHeading} language={language} onFocusReturnHandled={onFocusReturnHandled} onGoal={onGoal} onQr={onQr} spots={spots} stampedSpotIds={stampedSpotIds} />
      <div className={styles.infoTiles}>
        <InfoTile kind="how" label={copy.howToPlay} onClick={() => onInfo("how")} />
        <InfoTile kind="prizes" label={copy.prizes} onClick={() => onInfo("prizes")} />
        <InfoTile kind="recovery" label={copy.recovery} onClick={() => onInfo("recovery")} />
      </div>
    </main>
  );
}
