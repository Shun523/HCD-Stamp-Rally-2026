import { ExternalLink } from "lucide-react";
import type { Sponsor } from "../../data/sponsors.js";
import type { Language } from "../../data/content.js";
import styles from "./SponsorCard.module.css";

type Props = { language: Language; sponsor: Sponsor };

export function SponsorCard({ language, sponsor }: Props) {
  const name = language === "ja" ? sponsor.nameJa : sponsor.nameEn;
  const description = language === "ja" ? sponsor.descriptionJa : sponsor.descriptionEn;
  const contents = <><span className={styles.logoFrame}><img alt={`${name} logo`} src={sponsor.logoPath} /></span><strong>{name}</strong>{description && <span className={styles.description}>{description}</span>}{sponsor.url && <ExternalLink aria-hidden="true" className={styles.external} size={18} strokeWidth={2.25} />}</>;
  if (sponsor.url) return <a className={[styles.card, styles.link].join(" ")} href={sponsor.url} rel="noreferrer" target="_blank">{contents}</a>;
  return <article className={styles.card}>{contents}</article>;
}
