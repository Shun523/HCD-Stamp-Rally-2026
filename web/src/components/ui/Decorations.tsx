import styles from "./Decorations.module.css";

export function Sparkle({ tone = "yellow" }: { tone?: "yellow" | "coral" | "purple" }) {
  return <svg aria-hidden="true" className={[styles.sparkle, styles[tone]].join(" ")} viewBox="0 0 24 24"><path d="M12 0 15.2 8.8 24 12l-8.8 3.2L12 24l-3.2-8.8L0 12l8.8-3.2Z" /></svg>;
}

export function SpeechBubble({ children }: { children: string }) {
  return <span className={styles.speechBubble}>{children}</span>;
}

export function CropMarks() {
  return <span aria-hidden="true" className={styles.cropMarks}><i /><i /><i /><i /></span>;
}
