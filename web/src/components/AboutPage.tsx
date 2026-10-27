import { aboutItems } from "../data/about.js";
import type { Copy, Language } from "../data/content.js";
import { AboutCard } from "./ui/AboutCard.js";
import styles from "./AboutPage.module.css";

export function AboutPage({ copy, language }: { copy: Copy; language: Language }) {
  return <main className={styles.page}><header><h1>{copy.aboutTitle}</h1><p>{copy.aboutHint}</p></header><section aria-label={copy.aboutTitle} className={styles.list}>{[...aboutItems].sort((left, right) => left.displayOrder - right.displayOrder).map((item) => <AboutCard item={item} key={item.displayOrder} language={language} />)}</section></main>;
}
