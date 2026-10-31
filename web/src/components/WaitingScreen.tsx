import type { Copy, Language } from "../data/content.js";
import { Card } from "./ui/Card.js";
import { Chip } from "./ui/Chip.js";
import { IconButton } from "./ui/IconButton.js";
import { Tag } from "./ui/Tag.js";
import styles from "./WaitingScreen.module.css";

type Props = { copy: Copy; language: Language; onLanguageChange: (language: Language) => void; tag: string; headline: string; message: string };

// 仕様4-8 / デザイン4-10: 一般開放前は開始日時と案内だけを、終了後は終了の案内だけを出し、ほかの画面へは進めない。
export function WaitingScreen({ copy, language, onLanguageChange, tag, headline, message }: Props) {
  return (
    <main className={styles.page}>
      <h1 className={styles.visuallyHidden}>{copy.waitingTitle}</h1>
      <div className={styles.topRow}>
        <Chip>{copy.eventChip}</Chip>
        <IconButton label={copy.switchLanguage} type="button" onClick={() => onLanguageChange(language === "ja" ? "en" : "ja")}><span className={styles.language}>{language === "ja" ? "EN" : "日本語"}</span></IconButton>
      </div>
      <div className={styles.center}>
        <Card className={styles.card}>
          <Tag className={styles.tag}>{tag}</Tag>
          <p className={styles.opens}>{headline}</p>
          <p className={styles.message}>{message}</p>
        </Card>
      </div>
    </main>
  );
}
