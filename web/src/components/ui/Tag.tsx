import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Tag.module.css";

type Props = HTMLAttributes<HTMLSpanElement> & { children: ReactNode };

export function Tag({ children, className, ...props }: Props) {
  return <span {...props} className={[styles.tag, className ?? ""].filter(Boolean).join(" ")}>{children}</span>;
}
