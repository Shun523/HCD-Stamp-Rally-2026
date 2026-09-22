import styles from "./NumberBadge.module.css";

type Props = { number: number; tone?: "coral" | "purple" };

export function NumberBadge({ number, tone = number === 2 ? "purple" : "coral" }: Props) {
  return <span aria-hidden="true" className={[styles.badge, styles[tone]].join(" ")}>{number}</span>;
}
