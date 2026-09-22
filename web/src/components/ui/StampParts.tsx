import { Flag, Star } from "lucide-react";
import { useState } from "react";
import { stampAssetPath } from "../../data/stamps.js";
import styles from "./StampParts.module.css";

const rotations: Record<string, string> = {
  "spot-01": "-8deg",
  "spot-02": "6deg",
  "spot-03": "-4deg",
  "spot-04": "8deg",
  "spot-05": "-6deg",
};

export function StampImage({ alt = "", spotId }: { alt?: string; spotId: string }) {
  const [hasFailed, setHasFailed] = useState(false);
  const fallback = spotId.toUpperCase().replace("-", " ");
  if (hasFailed) return <span aria-label={alt || fallback} className={styles.fallbackStamp} role="img"><Star aria-hidden="true" fill="currentColor" size={34} strokeWidth={2.25} /><span>{fallback}</span></span>;
  return <img alt={alt} className={styles.stampImage} onError={() => setHasFailed(true)} src={stampAssetPath(spotId)} style={{ "--stamp-rotation": rotations[spotId] ?? "0deg" } as React.CSSProperties} />;
}

export function SpotMarker({ label, number, onClick }: { label: string; number: number; onClick: () => void }) {
  return <button aria-label={label} className={styles.spotMarker} type="button" onClick={onClick}>{number}</button>;
}

export function StampSlot({ label, spotId }: { label: string; spotId: string }) {
  return <span aria-label={label} className={styles.stampSlot} role="img"><StampImage spotId={spotId} /></span>;
}

export function ProgressBadge({ count, total = 5 }: { count: number; total?: number }) {
  return <span aria-label={`${count}/${total}`} className={styles.progressBadge}>{count}/{total}</span>;
}

export function GoalMedallion({ complete, label, lockedCaption = "5こで完走", onOpen }: { complete: boolean; label: string; lockedCaption?: string; onOpen: () => void }) {
  if (complete) return <button aria-label={label} className={[styles.goal, styles.complete].join(" ")} type="button" onClick={onOpen}><Flag aria-hidden="true" size={26} strokeWidth={2.25} /><strong>COMPLETE</strong></button>;
  return <span aria-label={label} className={styles.goal}><Flag aria-hidden="true" size={26} strokeWidth={2.25} /><strong>GOAL</strong><small>{lockedCaption}</small></span>;
}
