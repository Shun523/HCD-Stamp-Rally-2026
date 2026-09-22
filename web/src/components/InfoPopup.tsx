import type { Copy, Language } from "../data/content.js";
import { content } from "../data/content.js";
import { NumberBadge } from "./ui/NumberBadge.js";
import { Popup } from "./ui/Popup.js";
import type { InfoTileKind } from "./ui/InfoTile.js";
import styles from "./InfoPopup.module.css";

type Props = { copy: Copy; isOpen: boolean; kind: InfoTileKind | undefined; language: Language; onClose: () => void };

export function InfoPopup({ copy, isOpen, kind, language, onClose }: Props) {
  const prize = content.prizeExchange[language];
  const title = kind === "how" ? copy.popupHowTitle : kind === "prizes" ? copy.popupPrizeTitle : copy.popupRecoveryTitle;
  return (
    <Popup closeLabel={copy.close} isOpen={isOpen} onClose={onClose} title={title}>
      {kind === "how" && <><ol className={styles.steps}>{copy.introSteps.map((step, index) => <li key={step}><NumberBadge number={index + 1} /><span>{step}</span></li>)}</ol><p className={styles.hint}>{copy.popupHowHint}</p></>}
      {kind === "prizes" && <><dl className={styles.details}><div><dt>{copy.prizeName}</dt><dd>{prize.name}</dd></div><div><dt>{copy.prizeLocation}</dt><dd>{prize.location}</dd></div><div><dt>{copy.prizeHours}</dt><dd>{prize.hours}</dd></div></dl><p className={styles.hint}>{copy.popupPrizeHint}</p></>}
      {kind === "recovery" && <><p className={styles.body}>{copy.popupRecoveryBody}</p><p className={styles.hint}>{copy.popupRecoveryHint}</p></>}
    </Popup>
  );
}
