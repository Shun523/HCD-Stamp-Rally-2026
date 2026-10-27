import type { Copy, Language } from "../data/content.js";
import { sponsors } from "../data/sponsors.js";
import { SponsorCard } from "./ui/SponsorCard.js";
import styles from "./SponsorsPage.module.css";

export function SponsorsPage({ copy, language }: { copy: Copy; language: Language }) {
  return <main className={styles.page}><header><h1>{copy.sponsorsTitle}</h1><p>{copy.sponsorsHint}</p></header><section aria-label={copy.sponsorsTitle} className={styles.grid}>{[...sponsors].sort((left, right) => left.displayOrder - right.displayOrder).map((sponsor) => <SponsorCard key={sponsor.displayOrder} language={language} sponsor={sponsor} />)}</section></main>;
}
