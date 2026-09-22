import type { StampedEvent } from "@hcd-stamp-rally/shared";
import type { Copy } from "../data/content.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { ProgressBadge, StampImage } from "./ui/StampParts.js";
import styles from "./StampAnimation.module.css";

type Props = { copy: Copy; event: StampedEvent; onClose: () => void; onGoal: () => void; spotName: string };

export function StampAnimation({ copy, event, onClose, onGoal, spotName }: Props) {
  const action = event.completed ? onGoal : onClose;
  return (
    <section aria-labelledby="stamp-earned-title" aria-modal="true" className={styles.overlay} role="dialog">
      <Card className={styles.card}><StampImage alt="" spotId={event.spot_id} /><h2 id="stamp-earned-title" className={styles.outlined}>{copy.earnedTitle}</h2><p>{spotName}</p><ProgressBadge count={event.stamp_count} total={event.total_spots} /><Button fullWidth type="button" onClick={action}>{event.completed ? copy.goToGoal : copy.close}</Button></Card>
    </section>
  );
}
