import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";

type Props = HTMLAttributes<HTMLSpanElement> & { children: ReactNode; tone?: "yellow" | "surface" };

export function Chip({ children, className, tone = "yellow", ...props }: Props) {
  return <span {...props} className={[styles.chip, styles[tone], className ?? ""].filter(Boolean).join(" ")}>{children}</span>;
}
