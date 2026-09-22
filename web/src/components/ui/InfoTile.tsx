import { CircleHelp, Gift, LifeBuoy } from "lucide-react";
import styles from "./InfoTile.module.css";

export type InfoTileKind = "how" | "prizes" | "recovery";

type Props = {
  kind: InfoTileKind;
  label: string;
  onClick: () => void;
};

const icons = { how: CircleHelp, prizes: Gift, recovery: LifeBuoy };

export function InfoTile({ kind, label, onClick }: Props) {
  const Icon = icons[kind];
  return <button className={styles.tile} type="button" onClick={onClick}><Icon aria-hidden="true" size={24} strokeWidth={2.25} /><span>{label}</span></button>;
}
