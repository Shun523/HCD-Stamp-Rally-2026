import type { Copy } from "../data/content.js";
import { NumberBadge } from "./ui/NumberBadge.js";
import { Popup } from "./ui/Popup.js";
import type { InfoTileKind } from "./ui/InfoTile.js";
import styles from "./InfoPopup.module.css";

type Props = { copy: Copy; isOpen: boolean; kind: InfoTileKind | undefined; onClose: () => void };

// デザイン4-3: 遊び方は3手順だけ、スタンプが消えた方へは本文だけを出す（仕様v1.12）。
export function InfoPopup({ copy, isOpen, kind, onClose }: Props) {
  const title = kind === "how" ? copy.popupHowTitle : copy.popupRecoveryTitle;
  return (
    <Popup closeLabel={copy.close} isOpen={isOpen} onClose={onClose} title={title}>
      {kind === "how" && <ol className={styles.steps}>{copy.introSteps.map((step, index) => <li key={step}><NumberBadge number={index + 1} /><span>{step}</span></li>)}</ol>}
      {kind === "recovery" && <p className={styles.body}>{copy.popupRecoveryBody}</p>}
    </Popup>
  );
}
