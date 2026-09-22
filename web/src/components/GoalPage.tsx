import { Flag, Gift } from "lucide-react";
import type { Spot } from "@hcd-stamp-rally/shared";
import type { Copy, Language } from "../data/content.js";
import { content } from "../data/content.js";
import { Button } from "./ui/Button.js";
import { BoardCard, Card } from "./ui/Card.js";
import { Chip } from "./ui/Chip.js";
import { Sparkle } from "./ui/Decorations.js";
import { StampSlot } from "./ui/StampParts.js";
import styles from "./GoalPage.module.css";

type Props = { copy: Copy; language: Language; onBack: () => void; spots: Spot[] };

export function GoalPage({ copy, language, onBack, spots }: Props) {
  const prize = content.prizeExchange[language];
  return (
    <main className={styles.page}>
      <section className={styles.celebration}>
        <Sparkle tone="purple" /><Sparkle tone="yellow" /><Sparkle tone="coral" />
        <div className={styles.medallion}><Chip className={styles.completeChip}>{copy.goalStamp}</Chip><strong className={styles.outlined}>{copy.goalStamp}</strong></div>
      </section>
      <div className={styles.copy}><h1>{copy.goalTitle}</h1><p>{copy.goalHint}</p></div>
      <BoardCard className={styles.roadCard}><div className={styles.roadLine}>{spots.map((spot) => <span key={spot.id}><StampSlot label="" spotId={spot.id} /></span>)}<Flag aria-hidden="true" size={30} strokeWidth={2.25} /></div></BoardCard>
      <Card className={styles.prizeCard}><Gift aria-hidden="true" size={30} strokeWidth={2.25} /><strong>{copy.goalShowStaff}</strong><hr /><span>{copy.prizeName}</span><b>{prize.name}</b><small>{prize.location}</small></Card>
      <Button fullWidth type="button" variant="secondary" onClick={onBack}>{copy.backToBook}</Button>
    </main>
  );
}
