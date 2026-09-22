import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

type Props = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
  children: ReactNode;
  tone?: "surface" | "board" | "band";
};

export function Card({ as: Element = "section", children, className, tone = "surface", ...props }: Props) {
  return <Element {...props} className={[styles.card, styles[tone], className ?? ""].filter(Boolean).join(" ")}>{children}</Element>;
}

export function BoardCard(props: Omit<Props, "tone">) { return <Card {...props} tone="board" />; }
export function Band(props: Omit<Props, "tone">) { return <Card {...props} tone="band" />; }
