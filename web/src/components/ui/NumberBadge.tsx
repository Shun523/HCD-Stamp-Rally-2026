import styles from "./NumberBadge.module.css";

type Props = { number: number };

export function NumberBadge({ number }: Props) {
  return <span aria-hidden="true" className={styles.badge}>{number}</span>;
}
