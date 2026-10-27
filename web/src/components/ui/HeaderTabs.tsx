import { Info, Map, Stamp } from "lucide-react";
import styles from "./HeaderTabs.module.css";

export type ParticipantTab = "book" | "map" | "about";

type Props = {
  active: ParticipantTab;
  labels: Record<ParticipantTab, string>;
  onSelect: (tab: ParticipantTab) => void;
};

const tabs: Array<{ id: ParticipantTab; Icon: typeof Stamp }> = [
  { id: "book", Icon: Stamp },
  { id: "map", Icon: Map },
  { id: "about", Icon: Info },
];

export function HeaderTabs({ active, labels, onSelect }: Props) {
  return (
    <nav aria-label="Participant navigation" className={styles.nav}>
      {tabs.map(({ id, Icon }) => (
        <a
          aria-current={active === id ? "page" : undefined}
          className={[styles.tab, active === id ? styles.active : ""].filter(Boolean).join(" ")}
          href={`#${id}`}
          key={id}
          onClick={(event) => { event.preventDefault(); onSelect(id); }}
        >
          <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
          <span>{labels[id]}</span>
        </a>
      ))}
    </nav>
  );
}
