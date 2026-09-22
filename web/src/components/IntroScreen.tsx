import type { Copy } from "../data/content.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { NumberBadge } from "./ui/NumberBadge.js";
import styles from "./IntroScreen.module.css";

type Props = { copy: Copy; onStart: () => void };

// 仕様4-1: 初回説明では遊び方、機器の仮画像、ブラウザ保存の注意を常に伝える。
export function IntroScreen({ copy, onStart }: Props) {
  return (
    <main className={styles.page}>
      <h1 className={styles.outlined}>{copy.introTitle}</h1>
      <Card className={styles.photoCard}>
        <img alt={copy.introPhoto} src="/images/stamp-machine.svg" />
        <span>{copy.introPhoto}</span>
      </Card>
      <ol className={styles.steps}>
        {copy.introSteps.map((step, index) => <li key={step}><Card as="div"><NumberBadge number={index + 1} /><span>{step}</span></Card></li>)}
      </ol>
      <Card className={styles.notice} tone="band"><p>{copy.browserNotice}</p></Card>
      <Button fullWidth type="button" onClick={onStart}>{copy.start}</Button>
    </main>
  );
}
