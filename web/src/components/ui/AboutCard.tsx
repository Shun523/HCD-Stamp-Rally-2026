import { ExternalLink } from "lucide-react";
import type { AboutItem } from "../../data/about.js";
import type { Language } from "../../data/content.js";
import styles from "./AboutCard.module.css";

type Props = { item: AboutItem; language: Language };

export function AboutCard({ item, language }: Props) {
  const name = language === "ja" ? item.nameJa : item.nameEn;
  const description = language === "ja" ? item.descriptionJa : item.descriptionEn;
  const contents = <><span className={styles.photoFrame}><img alt="" src={item.photoPath} /></span><span className={styles.name}><strong>{name}</strong>{item.url && <ExternalLink aria-hidden="true" size={18} strokeWidth={2.25} />}</span><span className={styles.description}>{description}</span></>;
  if (item.url) return <a className={[styles.card, styles.link].join(" ")} href={item.url} rel="noreferrer" target="_blank">{contents}</a>;
  return <article className={styles.card}>{contents}</article>;
}
