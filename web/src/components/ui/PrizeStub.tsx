import { Flag, Scissors } from "lucide-react";
import type { Copy } from "../../data/content.js";
import { translate } from "../../data/content.js";
import styles from "./PrizeStub.module.css";

type Props = {
  complete: boolean;
  copy: Copy;
  onGoal: () => void;
  remaining: number;
};

// デザイン4-1: 台紙の一部として見せる、切り取り線付きの景品引換券。
export function PrizeStub({ complete, copy, onGoal, remaining }: Props) {
  const lockedGoal = translate(copy.goalLocked, { count: remaining });
  return (
    <section className={[styles.stub, complete ? styles.complete : ""].filter(Boolean).join(" ")}>
      <div aria-hidden="true" className={styles.cutLine}><span className={styles.scissors}><Scissors size={20} strokeWidth={2.25} /></span></div>
      <i aria-hidden="true" className={[styles.notch, styles.leftNotch].join(" ")} />
      <i aria-hidden="true" className={[styles.notch, styles.rightNotch].join(" ")} />
      <div className={styles.content}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{complete ? copy.prizeStubComplete : copy.prizeStubTitle}</p>
          <p className={styles.message}>{complete ? copy.prizeStubCompleteHint : copy.prizeStubLockedHint}</p>
        </div>
        {complete ? (
          <button aria-label={copy.goalOpen} className={styles.goalButton} type="button" onClick={onGoal}><Flag aria-hidden="true" size={18} strokeWidth={2.25} /><span>{copy.goToGoal}</span></button>
        ) : (
          <span aria-label={lockedGoal} className={styles.goalBadge} role="img"><Flag aria-hidden="true" size={18} strokeWidth={2.25} /><strong>GOAL</strong><small>{lockedGoal}</small></span>
        )}
      </div>
    </section>
  );
}
