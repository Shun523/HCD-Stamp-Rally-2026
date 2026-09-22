import type { CSSProperties } from "react";
import type { Spot } from "@hcd-stamp-rally/shared";
import type { Copy } from "../data/content.js";
import { BoardCard } from "./ui/Card.js";
import { GoalMedallion, ProgressBadge, SpotMarker, StampSlot } from "./ui/StampParts.js";
import { InfoTile, type InfoTileKind } from "./ui/InfoTile.js";
import styles from "./StampBook.module.css";

type Props = {
  copy: Copy;
  onGoal: () => void;
  onInfo: (kind: InfoTileKind) => void;
  onQr: () => void;
  spots: Spot[];
  stampedSpotIds: ReadonlySet<string>;
};

const boardPosition = (index: number): CSSProperties => {
  const radians = (-90 + 72 * index) * (Math.PI / 180);
  return { left: `${50 + 36 * Math.cos(radians)}%`, top: `${50 + 36 * Math.sin(radians)}%` };
};

// 仕様4-2 / デザイン4-1: 5枠を中央GOALの周囲に真上から時計回り72度ずつ並べる。
export function StampBook({ copy, onGoal, onInfo, onQr, spots, stampedSpotIds }: Props) {
  const count = stampedSpotIds.size;
  const complete = count >= spots.length && spots.length > 0;
  return (
    <main className={styles.page}>
      <div className={styles.titleRow}><h1 className={styles.outlined}>{copy.bookTitle}</h1><ProgressBadge count={count} /></div>
      <BoardCard className={styles.board}>
        <svg aria-hidden="true" className={styles.road} viewBox="0 0 100 100"><circle cx="50" cy="50" fill="none" r="36" className={styles.roadInk} /><circle cx="50" cy="50" fill="none" r="36" className={styles.roadFill} /><circle cx="50" cy="50" fill="none" r="36" className={styles.roadDash} /></svg>
        <i aria-hidden="true" className={[styles.tree, styles.treeOne].join(" ")} /><i aria-hidden="true" className={[styles.tree, styles.treeTwo].join(" ")} /><i aria-hidden="true" className={[styles.tree, styles.treeThree].join(" ")} />
        {spots.map((spot, index) => {
          const stamped = stampedSpotIds.has(spot.id);
          const name = spot.name_ja;
          return <div className={styles.slot} key={spot.id} style={boardPosition(index)}>{stamped ? <StampSlot label={`${name} ${copy.stamped}`} spotId={spot.id} /> : <SpotMarker label={`${name} ${copy.showQr}`} number={index + 1} onClick={onQr} />}</div>;
        })}
        <div className={styles.goal}><GoalMedallion complete={complete} label={complete ? copy.goalOpen : copy.goalLocked} lockedCaption={copy.goalLocked} onOpen={onGoal} /></div>
      </BoardCard>
      <p className={styles.hint}>{copy.bookHint}</p>
      <div className={styles.infoTiles}>
        <InfoTile kind="how" label={copy.howToPlay} onClick={() => onInfo("how")} />
        <InfoTile kind="prizes" label={copy.prizes} onClick={() => onInfo("prizes")} />
        <InfoTile kind="recovery" label={copy.recovery} onClick={() => onInfo("recovery")} />
      </div>
    </main>
  );
}
