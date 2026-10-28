import type { StampedEvent } from "@hcd-stamp-rally/shared";
import type { Copy } from "../data/content.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Sparkle } from "./ui/Decorations.js";
import { ProgressBadge, StampImage } from "./ui/StampParts.js";
import styles from "./StampAnimation.module.css";

type Props = { copy: Copy; event: StampedEvent; onClose: () => void; spotName: string };

const bursts = [{ className: styles.burst1, tone: "yellow" }, { className: styles.burst2, tone: "coral" }, { className: styles.burst3, tone: "purple" }] as const;

// デザイン4-4: スタンプが台紙へ落ちて着地し、円の線ときらきらが出る。「とじる」は動きの途中でも押せる。
// 5個目も「とじる」だけを置き、閉じるとスタンプ帳のCOMPLETE表示が見える（仕様v1.12）。
export function StampAnimation({ copy, event, onClose, spotName }: Props) {
  return (
    <section aria-labelledby="stamp-earned-title" aria-modal="true" className={styles.overlay} role="dialog">
      <Card className={styles.card}><div className={styles.stampArea}><span className={styles.ring} /><span className={styles.stampMotion}><StampImage alt="" spotId={event.spot_id} /></span>{bursts.map(({ className, tone }) => <span className={[styles.burst, className].join(" ")} key={tone}><Sparkle tone={tone} /></span>)}</div><h2 id="stamp-earned-title" className={[styles.outlined, styles.title].join(" ")}>{copy.earnedTitle}</h2><p className={styles.spotName}>{spotName}</p><div className={styles.badgeRow}><ProgressBadge count={event.stamp_count} total={event.total_spots} /></div><Button fullWidth type="button" onClick={onClose}>{copy.close}</Button></Card>
    </section>
  );
}
